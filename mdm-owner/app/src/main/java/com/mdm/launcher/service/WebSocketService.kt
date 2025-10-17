package com.mdm.launcher.service

import android.app.*
import android.content.*
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import com.mdm.launcher.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.network.WebSocketClient
import com.mdm.launcher.utils.ConnectionStateManager
import com.mdm.launcher.utils.NetworkMonitor
import kotlinx.coroutines.*

class WebSocketService : Service() {
    
    private val binder = LocalBinder()
    private var webSocketClient: WebSocketClient? = null
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var isServiceRunning = false
    @Volatile private var isInitializing = false // Flag para evitar múltiplas inicializações
    private var healthCheckJob: Job? = null
    @Volatile private var isScreenActive = true // Estado da tela para heartbeat adaptativo
    private var networkMonitor: NetworkMonitor? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    
    // Runnable para desativar modo manutenção (para poder cancelar timers antigos)
    private var maintenanceRunnable: Runnable? = null
    
    // Lock para evitar race conditions com launchers
    private val launcherLock = Object()
    
    // BroadcastReceiver para comandos internos
    private val commandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                "com.mdm.launcher.NETWORK_CHANGE" -> {
                    Log.d(TAG, "🌐 Broadcast de mudança de rede recebido")
                    handleNetworkChange()
                }
                "com.mdm.launcher.FORCE_RECONNECT" -> {
                    Log.d(TAG, "🔄 Broadcast de reconexão forçada recebido")
                    forceReconnect()
                }
                "com.mdm.launcher.HEALTH_CHECK" -> {
                    Log.d(TAG, "🏥 Broadcast de health check recebido")
                    performHealthCheck()
                }
                "com.mdm.launcher.END_MAINTENANCE_INTERNAL" -> {
                    Log.d(TAG, "🔧 ═══════════════════════════════════════════════")
                    Log.d(TAG, "🔧 BROADCAST INTERNO RECEBIDO: END_MAINTENANCE_INTERNAL")
                    Log.d(TAG, "🔧 Processando desabilitação de launchers...")
                    Log.d(TAG, "🔧 ═══════════════════════════════════════════════")
                    
                    // Cancelar o timer agendado
                    maintenanceRunnable?.let {
                        handler.removeCallbacks(it)
                        maintenanceRunnable = null
                        Log.d(TAG, "✅ Timer de manutenção cancelado")
                    }
                    
                    // Desabilitar outros launchers
                    disableOtherLaunchers()
                }
            }
        }
    }
    
    companion object {
        private const val TAG = "WebSocketService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "websocket_service_channel"
        private const val CHANNEL_NAME = "MDM Launcher Service"
        private const val CHANNEL_DESCRIPTION = "Mantém conexão com servidor MDM"
    }
    
    inner class LocalBinder : Binder() {
        fun getService(): WebSocketService = this@WebSocketService
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "WebSocketService criado")
        createNotificationChannel()
        
        // Registrar BroadcastReceiver para comandos
        val filter = IntentFilter().apply {
            addAction("com.mdm.launcher.NETWORK_CHANGE")
            addAction("com.mdm.launcher.FORCE_RECONNECT")
            addAction("com.mdm.launcher.HEALTH_CHECK")
            addAction("com.mdm.launcher.END_MAINTENANCE_INTERNAL")
        }
        // Android 13+ requer especificar se o receiver é exportado ou não
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, filter)
        }
        Log.d(TAG, "BroadcastReceiver registrado")
        
        // Adquirir WakeLock parcial para manter CPU ativa durante reconexão
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "MDMLauncher::WebSocketWakeLock"
        )
        
        // Agendar verificações periódicas com WorkManager
        ConnectionStateManager.scheduleHealthChecks(this)
        Log.d(TAG, "WorkManager health checks agendados")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "WebSocketService.onStartCommand() chamado")
        startForeground(NOTIFICATION_ID, createNotification())
        isServiceRunning = true
        
        // Iniciar conexão WebSocket em background APENAS se não estiver inicializando ou já conectado
        if (webSocketClient == null && !isInitializing) {
            Log.d(TAG, "Iniciando nova conexão WebSocket...")
            serviceScope.launch {
                initializeWebSocket()
            }
        } else if (webSocketClient != null) {
            Log.d(TAG, "WebSocket já existe - pulando inicialização")
            // Se já existe mas não está conectado, tentar reconectar
            if (webSocketClient?.isConnected() == false) {
                Log.d(TAG, "WebSocket existe mas não está conectado - reconectando...")
                webSocketClient?.connect()
            }
        } else {
            Log.d(TAG, "Inicialização já em andamento - pulando...")
        }
        
        return START_STICKY // Reiniciar automaticamente se for morto
    }
    
    override fun onBind(intent: Intent?): IBinder {
        return binder
    }
    
    override fun onDestroy() {
        Log.d(TAG, "WebSocketService sendo destruído - iniciando cleanup...")
        isServiceRunning = false
        
        // Cancelar health check
        healthCheckJob?.cancel()
        healthCheckJob = null
        
        // Cancelar timer de modo manutenção (se existir)
        try {
            maintenanceRunnable?.let {
                handler.removeCallbacks(it)
                maintenanceRunnable = null
                Log.d(TAG, "Timer de modo manutenção cancelado")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao cancelar timer de modo manutenção", e)
        }
        
        // Parar e limpar NetworkMonitor
        try {
            networkMonitor?.stopMonitoring()
            networkMonitor?.destroy()
            networkMonitor = null
            Log.d(TAG, "NetworkMonitor limpo")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar NetworkMonitor", e)
        }
        
        // Desregistrar BroadcastReceiver
        try {
            unregisterReceiver(commandReceiver)
            Log.d(TAG, "BroadcastReceiver desregistrado")
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao desregistrar receiver", e)
        }
        
        // Liberar WakeLock
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "WakeLock liberado")
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar WakeLock", e)
        }
        
        // Cleanup WebSocket
        try {
            webSocketClient?.cleanup()
            webSocketClient = null
            Log.d(TAG, "WebSocketClient limpo")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar WebSocketClient", e)
        }
        
        // Cancelar scope de coroutines
        try {
            serviceScope.cancel()
            Log.d(TAG, "ServiceScope cancelado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao cancelar serviceScope", e)
        }
        
        Log.d(TAG, "WebSocketService cleanup completo")
        super.onDestroy()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = CHANNEL_DESCRIPTION
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM Launcher")
            .setContentText("Conectado ao servidor")
            .setSmallIcon(R.drawable.ic_service_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .setPriority(Notification.PRIORITY_LOW)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }
    
    private suspend fun initializeWebSocket() {
        try {
            isInitializing = true
            Log.d(TAG, "🔧 Inicializando WebSocket em background")
            
            // Descobrir servidor automaticamente
            val serverUrl = com.mdm.launcher.utils.ServerDiscovery.discoverServer(this)
            Log.d(TAG, "🔍 Servidor descoberto no Service: $serverUrl")
            
            // Usar DeviceIdManager para obter ID persistente
            val deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
            val deviceIdInfo = com.mdm.launcher.utils.DeviceIdManager.getDeviceIdInfo(this)
            
            Log.d(TAG, "📱 DeviceId: ${deviceId.takeLast(8)}")
            Log.d(TAG, "📱 Fonte: ${deviceIdInfo["source"]}")
            
            // Obter ou criar instância do WebSocketClient (singleton)
            webSocketClient = WebSocketClient.getInstance(
                serverUrl = serverUrl,
                deviceId = deviceId,
                onMessage = { message ->
                    Log.d(TAG, "Mensagem recebida em background: $message")
                    // Processar mensagens em background
                    processBackgroundMessage(message)
                },
                onConnectionChange = { connected ->
                    Log.d(TAG, "═══════════════════════════════════════")
                    Log.d(TAG, "🔔 STATUS DE CONEXÃO MUDOU: $connected")
                    Log.d(TAG, "═══════════════════════════════════════")
                    updateNotification(connected)
                    
                    // Salvar estado de conexão
                    ConnectionStateManager.saveConnectionState(this@WebSocketService, connected)
                    
                    // Quando conectar, coletar e enviar dados completos IMEDIATAMENTE
                    if (connected) {
                        Log.d(TAG, "📤 Conexão confirmada pelo servidor - enviando dados completos...")
                        sendDeviceStatusWithRealData()
                    }
                }
            )
            
            // Iniciar monitoramento de rede
            startNetworkMonitoring()
            
            // Conectar apenas se não estiver conectado
            if (webSocketClient?.isConnected() != true) {
                Log.d(TAG, "🚀 Iniciando conexão WebSocket...")
                webSocketClient?.connect()
                
                // Aguardar conexão abrir e enviar dados IMEDIATAMENTE
                serviceScope.launch {
                    delay(2000) // Aguardar 2s para conexão estabilizar
                    
                    if (webSocketClient?.isConnected() == true) {
                        Log.d(TAG, "✅ Conexão estabelecida - enviando device_status")
                        sendDeviceStatusWithRealData()
                    } else {
                        Log.w(TAG, "⚠️ Aguardando conexão ser estabelecida...")
                        // Tentar novamente após mais 3s
                        delay(3000)
                        if (webSocketClient?.isConnected() == true) {
                            Log.d(TAG, "✅ Conexão estabelecida (2ª tentativa) - enviando device_status")
                            sendDeviceStatusWithRealData()
                        }
                    }
                }
            } else {
                Log.d(TAG, "✓ WebSocket já está conectado - enviando device_status")
                sendDeviceStatusWithRealData()
            }
            
            // Iniciar verificação periódica de saúde
            startHealthCheck()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao inicializar WebSocket em background", e)
        } finally {
            isInitializing = false
        }
    }
    
    private fun processBackgroundMessage(message: String) {
        try {
            Log.d(TAG, "Processando mensagem em background: $message")
            
            // Parse da mensagem JSON
            val gson = com.google.gson.Gson()
            val jsonObject = gson.fromJson(message, Map::class.java)
            val type = jsonObject["type"] as? String
            
            when (type) {
                "device_status" -> {
                    Log.d(TAG, "Status do dispositivo solicitado em background")
                    sendDeviceStatus()
                }
                "ping" -> {
                    Log.d(TAG, "Ping recebido em background")
                    webSocketClient?.sendMessage("""{"type":"pong","timestamp":${System.currentTimeMillis()}}""")
                }
                "update_app_permissions" -> {
                    Log.d(TAG, "📱 UPDATE_APP_PERMISSIONS recebido no Service")
                    
                    try {
                        // Processar diretamente no Service
                        val jsonObject = gson.fromJson(message, Map::class.java)
                        val data = jsonObject["data"] as? Map<*, *>
                        val allowedAppsList = data?.get("allowedApps") as? List<*>
                        
                        Log.d(TAG, "═══════════════════════════════════════════")
                        Log.d(TAG, "📱 PROCESSANDO PERMISSÕES DE APPS NO SERVICE")
                        Log.d(TAG, "═══════════════════════════════════════════")
                        Log.d(TAG, "Apps permitidos recebidos: $allowedAppsList")
                        
                        if (allowedAppsList != null) {
                            // Salvar permissões no SharedPreferences CORRETO (mdm_launcher, não mdm_launcher_prefs)
                            val sharedPreferences = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                            val allowedAppsJson = gson.toJson(allowedAppsList)
                            sharedPreferences.edit()
                                .putString("allowed_apps", allowedAppsJson)
                                .apply()
                            
                            Log.d(TAG, "✅ Permissões salvas no SharedPreferences: ${allowedAppsList.size} apps")
                            Log.d(TAG, "✅ Salvo em: mdm_launcher -> allowed_apps")
                            Log.d(TAG, "Apps: $allowedAppsList")
                        }
                        
                        Log.d(TAG, "═══════════════════════════════════════════")
                        
                        // Encaminhar para MainActivity via Broadcast com FLAG explícito
                        val intent = Intent("com.mdm.launcher.UPDATE_APP_PERMISSIONS")
                        intent.setPackage(packageName) // Garantir que vá para nosso app
                        intent.putExtra("message", message)
                        intent.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES) // Enviar mesmo se app estiver parado
                        
                        Log.d(TAG, "📡 Enviando broadcast UPDATE_APP_PERMISSIONS para MainActivity")
                        Log.d(TAG, "Package: $packageName")
                        Log.d(TAG, "Message: $message")
                        
                        sendBroadcast(intent)
                        Log.d(TAG, "✅ Broadcast enviado")
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro ao processar permissões de apps", e)
                    }
                }
                "request_location" -> {
                    Log.d(TAG, "Localização solicitada em background")
                    // Implementar envio de localização em background
                }
                "clear_location_history" -> {
                    Log.d(TAG, "🗑️ ═══════════════════════════════════════════════")
                    Log.d(TAG, "🗑️ COMANDO: LIMPAR HISTÓRICO DE LOCALIZAÇÃO")
                    Log.d(TAG, "🗑️ ═══════════════════════════════════════════════")
                    
                    try {
                        // Limpar histórico usando LocationHistoryManager
                        com.mdm.launcher.utils.LocationHistoryManager.resetLocationHistory(this@WebSocketService)
                        
                        Log.d(TAG, "✅ Histórico de localização limpo com sucesso")
                        
                        // Enviar confirmação para o servidor
                        val confirmationMessage = mapOf(
                            "type" to "location_history_cleared",
                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                            "timestamp" to System.currentTimeMillis(),
                            "success" to true
                        )
                        webSocketClient?.sendMessage(gson.toJson(confirmationMessage))
                        Log.d(TAG, "✅ Confirmação de limpeza enviada para o servidor")
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro ao limpar histórico de localização", e)
                        
                        // Enviar erro para o servidor
                        val errorMessage = mapOf(
                            "type" to "location_history_cleared",
                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                            "timestamp" to System.currentTimeMillis(),
                            "success" to false,
                            "error" to e.message
                        )
                        webSocketClient?.sendMessage(gson.toJson(errorMessage))
                    }
                    
                    Log.d(TAG, "🗑️ ═══════════════════════════════════════════════")
                }
                "open_settings" -> {
                    Log.d(TAG, "⚙️ ═══════════════════════════════════════════════")
                    Log.d(TAG, "⚙️ COMANDO: ABRIR CONFIGURAÇÕES")
                    Log.d(TAG, "⚙️ ═══════════════════════════════════════════════")
                    
                    try {
                        // CANCELAR TIMER ANTERIOR (se existir) para evitar múltiplos timers
                        maintenanceRunnable?.let {
                            handler.removeCallbacks(it)
                            Log.d(TAG, "🗑️ Timer de manutenção anterior cancelado")
                        }
                        
                        val data = jsonObject["data"] as? Map<*, *>
                        var durationMinutes = (data?.get("duration_minutes") as? Number)?.toInt() ?: 5
                        
                        // VALIDAÇÃO: Limitar duração máxima para segurança
                        if (durationMinutes < 1) {
                            durationMinutes = 1
                            Log.w(TAG, "⚠️ Duração ajustada para mínimo: 1 minuto")
                        } else if (durationMinutes > 30) {
                            durationMinutes = 30
                            Log.w(TAG, "⚠️ Duração ajustada para máximo: 30 minutos")
                        }
                        
                        Log.d(TAG, "🔧 Ativando modo manutenção por $durationMinutes minutos")
                        
                        // Ativar modo manutenção temporariamente
                        val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                        val expiryTime = System.currentTimeMillis() + (durationMinutes * 60 * 1000)
                        
                        prefs.edit()
                            .putBoolean("maintenance_mode", true)
                            .putLong("maintenance_expiry", expiryTime)
                            .apply()
                        
                        Log.d(TAG, "✅ Modo manutenção ativado até ${java.text.SimpleDateFormat("HH:mm:ss").format(expiryTime)}")
                        
                        // Mostrar notificação informando que o launcher está desprotegido
                        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                        
                        // Criar canal de notificação para Android 8+
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val channel = android.app.NotificationChannel(
                                "maintenance_mode",
                                "Modo Manutenção",
                                android.app.NotificationManager.IMPORTANCE_HIGH
                            ).apply {
                                description = "Notificações de modo manutenção"
                            }
                            notificationManager.createNotificationChannel(channel)
                        }
                        
                        // Criar PendingIntent para abrir configurações ao clicar na notificação
                        val settingsIntent = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        }
                        
                        val settingsPendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            android.app.PendingIntent.getActivity(
                                this@WebSocketService,
                                2001,
                                settingsIntent,
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                            )
                        } else {
                            @Suppress("DEPRECATION")
                            android.app.PendingIntent.getActivity(
                                this@WebSocketService,
                                2001,
                                settingsIntent,
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT
                            )
                        }
                        
                        // Criar PendingIntent para encerrar modo manutenção
                        val endMaintenanceIntent = Intent("com.mdm.launcher.END_MAINTENANCE").apply {
                            setPackage(packageName) // Garantir que o intent é direcionado ao nosso app
                        }
                        
                        Log.d(TAG, "🔧 Criando PendingIntent para END_MAINTENANCE")
                        Log.d(TAG, "   Package: $packageName")
                        Log.d(TAG, "   Action: com.mdm.launcher.END_MAINTENANCE")
                        
                        val endMaintenancePendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            // Android 12+ (API 31+) - usar FLAG_MUTABLE para broadcasts
                            android.app.PendingIntent.getBroadcast(
                                this@WebSocketService,
                                2002,
                                endMaintenanceIntent,
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
                            )
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            android.app.PendingIntent.getBroadcast(
                                this@WebSocketService,
                                2002,
                                endMaintenanceIntent,
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                            )
                        } else {
                            @Suppress("DEPRECATION")
                            android.app.PendingIntent.getBroadcast(
                                this@WebSocketService,
                                2002,
                                endMaintenanceIntent,
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT
                            )
                        }
                        
                        Log.d(TAG, "✅ PendingIntent criado com sucesso")
                        
                        // Criar notificação
                        val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            android.app.Notification.Builder(this@WebSocketService, "maintenance_mode")
                        } else {
                            @Suppress("DEPRECATION")
                            android.app.Notification.Builder(this@WebSocketService)
                        }
                        
                        val notification = notificationBuilder
                            .setSmallIcon(android.R.drawable.ic_menu_manage)
                            .setContentTitle("🔧 Modo Manutenção Ativo")
                            .setContentText("Launcher desprotegido por $durationMinutes minutos. Toque no botão abaixo para encerrar.")
                            .setStyle(android.app.Notification.BigTextStyle()
                                .bigText("O launcher MDM está temporariamente desprotegido.\n\n" +
                                        "✅ Você pode:\n" +
                                        "• Abrir as Configurações do Android\n" +
                                        "• Navegar entre apps livremente\n" +
                                        "• Usar o botão HOME\n\n" +
                                        "⏰ Expira em $durationMinutes minutos\n" +
                                        "⏰ Às ${java.text.SimpleDateFormat("HH:mm").format(expiryTime)}\n\n" +
                                        "👆 Toque no botão \"Encerrar Modo\" abaixo para desativar antecipadamente"))
                            .addAction(
                                android.R.drawable.ic_menu_close_clear_cancel,
                                "🔒 Encerrar Modo",
                                endMaintenancePendingIntent
                            )
                            .setAutoCancel(false)
                            .setOngoing(true)
                            .build()
                        
                        notificationManager.notify(2000, notification)
                        
                        Log.d(TAG, "📱 Notificação de modo manutenção mostrada ao usuário")
                        
                        // Reabilitar outros launchers temporariamente para permitir navegação
                        // SINCRONIZADO para evitar race conditions
                        Log.d(TAG, "🔍 Iniciando reabilitação de launchers...")
                        synchronized(launcherLock) {
                        try {
                            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val componentName = android.content.ComponentName(this@WebSocketService, com.mdm.launcher.DeviceAdminReceiver::class.java)
                            
                            Log.d(TAG, "🔍 Device Owner status: ${dpm.isDeviceOwnerApp(packageName)}")
                            
                            if (dpm.isDeviceOwnerApp(packageName)) {
                                val pm = packageManager
                                val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                                    addCategory(Intent.CATEGORY_HOME)
                                }
                                
                                // Buscar TODOS os pacotes que podem ser launchers, incluindo ocultos e desabilitados
                                Log.d(TAG, "🔍 Buscando TODOS os launchers do sistema...")
                                val allLaunchers = pm.queryIntentActivities(
                                    homeIntent, 
                                    android.content.pm.PackageManager.MATCH_ALL or 
                                    android.content.pm.PackageManager.MATCH_DISABLED_COMPONENTS or
                                    android.content.pm.PackageManager.MATCH_UNINSTALLED_PACKAGES
                                )
                                Log.d(TAG, "🔍 Total de launchers encontrados (incluindo desabilitados): ${allLaunchers.size}")
                                
                                // Listar TODOS os pacotes do sistema para encontrar launchers conhecidos
                                val knownLaunchers = listOf(
                                    "com.android.launcher3",
                                    "com.google.android.apps.nexuslauncher", 
                                    "com.miui.home",
                                    "com.huawei.android.launcher",
                                    "com.oppo.launcher",
                                    "com.coloros.launcher",
                                    "com.realme.launcher",
                                    "com.samsung.android.app.launcher",
                                    "com.sec.android.app.launcher"
                                )
                                
                                Log.d(TAG, "🔍 Verificando launchers conhecidos no sistema...")
                                for (launcherPackage in knownLaunchers) {
                                    try {
                                        val isHidden = dpm.isApplicationHidden(componentName, launcherPackage)
                                        Log.d(TAG, "  📦 $launcherPackage → oculto: $isHidden")
                                    } catch (e: android.content.pm.PackageManager.NameNotFoundException) {
                                        Log.d(TAG, "  📦 $launcherPackage → NÃO INSTALADO")
                                    } catch (e: Exception) {
                                        Log.d(TAG, "  📦 $launcherPackage → erro: ${e.message}")
                                    }
                                }
                                
                                Log.d(TAG, "🔍 Tentando reabilitar launchers ocultos...")
                                
                                var reenabledCount = 0
                                
                                // Primeiro: Reabilitar launchers encontrados na query
                                for (launcher in allLaunchers) {
                                    val launcherPackage = launcher.activityInfo.packageName
                                    Log.d(TAG, "🔍 Analisando launcher: $launcherPackage (é nosso? ${launcherPackage == packageName})")
                                    
                                    if (launcherPackage != packageName) {
                                        try {
                                            // Verificar se está oculto
                                            val isHidden = dpm.isApplicationHidden(componentName, launcherPackage)
                                            Log.d(TAG, "🔍 Launcher $launcherPackage está oculto? $isHidden")
                                            
                                            if (isHidden) {
                                                // Reabilitar launcher
                                                val result = dpm.setApplicationHidden(componentName, launcherPackage, false)
                                                Log.d(TAG, "🔓 Tentativa de reabilitar $launcherPackage: sucesso=$result")
                                                if (result) {
                                                    reenabledCount++
                                                }
                                            } else {
                                                Log.d(TAG, "ℹ️ Launcher $launcherPackage já está visível")
                                            }
                                        } catch (e: Exception) {
                                            Log.e(TAG, "❌ Erro ao reabilitar launcher $launcherPackage", e)
                                        }
                                    }
                                }
                                
                                // Segundo: Tentar reabilitar launchers conhecidos forçadamente
                                Log.d(TAG, "🔍 Tentando reabilitar launchers conhecidos forçadamente...")
                                for (launcherPackage in knownLaunchers) {
                                    try {
                                        val isHidden = dpm.isApplicationHidden(componentName, launcherPackage)
                                        if (isHidden) {
                                            val result = dpm.setApplicationHidden(componentName, launcherPackage, false)
                                            Log.d(TAG, "🔓 Forçada reabilitação de $launcherPackage: sucesso=$result")
                                            if (result) {
                                                reenabledCount++
                                            }
                                        }
                                    } catch (e: Exception) {
                                        // Ignorar erros de pacotes não instalados
                                    }
                                }
                                
                                if (reenabledCount > 0) {
                                    Log.d(TAG, "✅ Launchers reabilitados: $reenabledCount")
                                    Log.d(TAG, "✅ Navegação livre permitida - pressione HOME para escolher launcher")
                                } else {
                                    Log.w(TAG, "⚠️ Nenhum launcher foi reabilitado!")
                                    Log.w(TAG, "⚠️ Este dispositivo pode ter apenas 1 launcher de fábrica.")
                                    Log.w(TAG, "💡 SOLUÇÃO: Pressione HOME e use a barra de navegação para acessar apps do sistema")
                                }
                            } else {
                                Log.w(TAG, "⚠️ App não é Device Owner - não pode gerenciar launchers")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ ERRO CRÍTICO ao reabilitar launchers", e)
                        }
                        } // fim synchronized(launcherLock)
                        
                        // Criar e armazenar o Runnable para poder cancelá-lo depois
                        maintenanceRunnable = Runnable {
                            Log.d(TAG, "⏰ Tempo de manutenção expirado - desativando modo manutenção")
                            prefs.edit()
                                .putBoolean("maintenance_mode", false)
                                .putLong("maintenance_expiry", 0)
                                .apply()
                            
                            // Remover notificação
                            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                            notificationManager.cancel(2000)
                            
                            // Desabilitar outros launchers novamente
                            disableOtherLaunchers()
                            
                            // Voltar ao launcher MDM
                            val launcherIntent = Intent(this@WebSocketService, com.mdm.launcher.MainActivity::class.java).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            }
                            startActivity(launcherIntent)
                            
                            Log.d(TAG, "🏠 Voltando ao launcher MDM - proteção reativada")
                        }
                        
                        // Agendar o Runnable armazenado
                        handler.postDelayed(maintenanceRunnable!!, durationMinutes * 60 * 1000L)
                        Log.d(TAG, "✅ Timer de desativação agendado para ${durationMinutes} minutos")
                        
                        // Enviar confirmação
                        val confirmationMessage = mapOf(
                            "type" to "settings_opened",
                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                            "timestamp" to System.currentTimeMillis(),
                            "success" to true,
                            "expiresAt" to expiryTime
                        )
                        webSocketClient?.sendMessage(gson.toJson(confirmationMessage))
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro ao abrir configurações", e)
                        
                        val errorMessage = mapOf(
                            "type" to "settings_opened",
                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                            "timestamp" to System.currentTimeMillis(),
                            "success" to false,
                            "error" to e.message
                        )
                        webSocketClient?.sendMessage(gson.toJson(errorMessage))
                    }
                    
                    Log.d(TAG, "⚙️ ═══════════════════════════════════════════════")
                }
                "update_app" -> {
                    Log.d(TAG, "📥 ═══════════════════════════════════════════════")
                    Log.d(TAG, "📥 COMANDO: ATUALIZAR APLICATIVO")
                    Log.d(TAG, "📥 ═══════════════════════════════════════════════")
                    
                    try {
                        val data = jsonObject["data"] as? Map<*, *>
                        val apkUrl = data?.get("apk_url") as? String
                        val version = data?.get("version") as? String
                        
                        if (apkUrl.isNullOrEmpty()) {
                            Log.e(TAG, "❌ URL do APK não fornecida")
                            sendUpdateStatus(false, "URL do APK não fornecida")
                            return
                        }
                        
                        Log.d(TAG, "📦 URL do APK: $apkUrl")
                        Log.d(TAG, "🔢 Versão: ${version ?: "não especificada"}")
                        
                        // Enviar status de início
                        sendUpdateStatus(true, "Download iniciado", 0)
                        
                        // Iniciar download e instalação
                        com.mdm.launcher.utils.AppUpdater.downloadAndInstall(
                            context = this@WebSocketService,
                            apkUrl = apkUrl,
                            onProgress = { progress ->
                                Log.d(TAG, "📊 Progresso do download: $progress%")
                                sendUpdateStatus(true, "Baixando atualização", progress)
                            },
                            onComplete = { success, message ->
                                Log.d(TAG, if (success) "✅ Atualização concluída: $message" else "❌ Falha na atualização: $message")
                                sendUpdateStatus(success, message, if (success) 100 else null)
                            }
                        )
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro ao processar atualização", e)
                        sendUpdateStatus(false, "Erro: ${e.message}")
                    }
                    
                    Log.d(TAG, "📥 ═══════════════════════════════════════════════")
                }
                "show_notification" -> {
                    Log.d(TAG, "═══════════════════════════════════════════")
                    Log.d(TAG, "📬 SHOW_NOTIFICATION RECEBIDO (SERVICE)")
                    Log.d(TAG, "═══════════════════════════════════════════")
                    
                    val dataMap = jsonObject["data"] as? Map<*, *> ?: jsonObject
                    val title = dataMap["title"] as? String ?: "MDM Launcher"
                    val body = dataMap["body"] as? String ?: "Nova notificação"
                    
                    Log.d(TAG, "Título: $title")
                    Log.d(TAG, "Corpo: $body")
                    
                    // Mostrar notificação em background
                    showBackgroundNotification(title, body)
                    
                    // Enviar confirmação de recebimento
                    val confirmationMessage = mapOf(
                        "type" to "notification_received",
                        "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                        "title" to title,
                        "body" to body,
                        "timestamp" to System.currentTimeMillis()
                    )
                    webSocketClient?.sendMessage(gson.toJson(confirmationMessage))
                    Log.d(TAG, "✅ Confirmação de notificação enviada")
                    Log.d(TAG, "═══════════════════════════════════════════")
                }
                "set_admin_password" -> {
                    Log.d(TAG, "🔐 === RECEBENDO SENHA DE ADMINISTRADOR (SERVICE) ===")
                    Log.d(TAG, "Mensagem completa: $message")
                    
                    val data = jsonObject["data"] as? Map<*, *>
                    val password = data?.get("password") as? String
                    
                    Log.d(TAG, "Data extraída: $data")
                    Log.d(TAG, "Password extraída: $password")
                    Log.d(TAG, "Password é null? ${password == null}")
                    Log.d(TAG, "Password vazia? ${password?.isEmpty()}")
                    
                    if (password != null && password.isNotEmpty()) {
                        // Salvar senha em SharedPreferences
                        val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                        prefs.edit().putString("admin_password", password).apply()
                        Log.d(TAG, "✅ Senha de administrador salva em background: $password")
                        
                        // Notificar MainActivity para recarregar a senha
                        val intent = Intent("com.mdm.launcher.ADMIN_PASSWORD_CHANGED")
                        intent.putExtra("password", password)
                        sendBroadcast(intent)
                        Log.d(TAG, "📢 Broadcast enviado para MainActivity recarregar senha")
                    } else {
                        Log.e(TAG, "❌ ERRO: Password é null ou vazia no Service")
                    }
                    Log.d(TAG, "===============================================")
                }
                "support_message_received" -> {
                    Log.d(TAG, "✅ Confirmação de mensagem de suporte recebida")
                    // Mostrar notificação de confirmação
                    showBackgroundNotification("Mensagem Enviada", "Sua mensagem foi recebida pelo servidor!")
                }
                "support_message_error" -> {
                    Log.e(TAG, "❌ Erro ao enviar mensagem de suporte")
                    showBackgroundNotification("Erro", "Não foi possível enviar a mensagem")
                }
                "set_kiosk_mode" -> {
                    Log.d(TAG, "📱 SET_KIOSK_MODE recebido no Service - encaminhando para MainActivity")
                    val intent = android.content.Intent("com.mdm.launcher.SET_KIOSK_MODE")
                    intent.putExtra("message", message)
                    sendBroadcast(intent)
                }
                "lock_device", "reboot_device", "wipe_device", "disable_camera", 
                "clear_app_cache", "install_app", "uninstall_app" -> {
                    Log.d(TAG, "📱 Comando UEM recebido no Service: $type - encaminhando para MainActivity")
                    val intent = android.content.Intent("com.mdm.launcher.UEM_COMMAND")
                    intent.putExtra("message", message)
                    sendBroadcast(intent)
                }
                else -> {
                    Log.d(TAG, "Tipo de mensagem não processado em background: $type")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem em background", e)
        }
    }
    
    /**
     * Envia status de atualização para o servidor
     */
    private fun sendUpdateStatus(success: Boolean, message: String, progress: Int? = null) {
        try {
            val statusMessage = mutableMapOf<String, Any>(
                "type" to "update_status",
                "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this),
                "timestamp" to System.currentTimeMillis(),
                "success" to success,
                "message" to message
            )
            
            progress?.let {
                statusMessage["progress"] = it
            }
            
            webSocketClient?.sendMessage(com.google.gson.Gson().toJson(statusMessage))
            Log.d(TAG, "📤 Status de atualização enviado: $message ${progress?.let { "($it%)" } ?: ""}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar status de atualização", e)
        }
    }
    
    private fun sendDeviceStatus() {
        serviceScope.launch {
            try {
                val deviceInfo = DeviceInfo(
                    deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                    name = android.os.Build.MODEL,
                    model = android.os.Build.MODEL,
                    manufacturer = android.os.Build.MANUFACTURER,
                    androidVersion = android.os.Build.VERSION.RELEASE,
                    appVersion = "1.0.0",
                    batteryLevel = 0, // Implementar coleta de bateria em background
                    isCharging = false,
                    batteryStatus = "Unknown",
                    isWifiEnabled = false, // Implementar verificação em background
                    isBluetoothEnabled = false,
                    isLocationEnabled = false,
                    isDeveloperOptionsEnabled = false,
                    isAdbEnabled = false,
                    isUnknownSourcesEnabled = false,
                    isDeviceOwner = false, // Implementar verificação em background
                    isProfileOwner = false,
                    storageTotal = 0L,
                    storageUsed = 0L,
                    memoryTotal = 0L,
                    memoryUsed = 0L,
                    cpuArchitecture = android.os.Build.CPU_ABI,
                    screenResolution = "Unknown",
                    screenDensity = 0,
                    networkType = "Unknown",
                    wifiSSID = null,
                    ipAddress = "Unknown",
                    macAddress = "Unknown",
                    serialNumber = com.mdm.launcher.utils.DeviceInfoCollector.getPublicSerialNumber(this@WebSocketService),
                    imei = "Unknown",
                    installedAppsCount = 0,
                    installedApps = emptyList(),
                    allowedApps = emptyList(),
                    apiLevel = android.os.Build.VERSION.SDK_INT,
                    timezone = java.util.TimeZone.getDefault().id,
                    language = java.util.Locale.getDefault().language,
                    country = java.util.Locale.getDefault().country
                )
                
                webSocketClient?.sendDeviceStatus(deviceInfo)
                Log.d(TAG, "Status do dispositivo enviado em background")
                
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar status do dispositivo em background", e)
            }
        }
    }
    
    private fun sendDeviceStatusWithRealData() {
        serviceScope.launch {
            try {
                Log.d(TAG, "📊 Coletando dados REAIS do dispositivo no Service...")
                
                // Carregar nome personalizado do SharedPreferences
                val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                val customDeviceName = prefs.getString("custom_device_name", "") ?: ""
                val deviceName = if (customDeviceName.isNotEmpty()) {
                    customDeviceName
                } else {
                    "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
                }
                
                Log.d(TAG, "📝 Nome do dispositivo para enviar: \"$deviceName\"")
                Log.d(TAG, "   customDeviceName: \"$customDeviceName\"")
                
                val deviceInfo = com.mdm.launcher.utils.DeviceInfoCollector.collectDeviceInfo(
                    this@WebSocketService, 
                    customName = deviceName
                )
                
                Log.d(TAG, "=== DADOS REAIS COLETADOS (SERVICE) ===")
                Log.d(TAG, "Bateria: ${deviceInfo.batteryLevel}%")
                Log.d(TAG, "Apps: ${deviceInfo.installedAppsCount}")
                Log.d(TAG, "Storage: ${deviceInfo.storageTotal / (1024*1024*1024)}GB")
                Log.d(TAG, "DeviceId: ${deviceInfo.deviceId.takeLast(4)}")
                Log.d(TAG, "Device Owner: ${deviceInfo.isDeviceOwner}")
                Log.d(TAG, "======================================")
                
                webSocketClient?.sendDeviceStatus(deviceInfo)
                Log.d(TAG, "✅ Dados reais enviados com sucesso do Service!")
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao enviar dados reais do dispositivo", e)
            }
        }
    }
    
    private fun updateNotification(isConnected: Boolean) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM Launcher")
            .setContentText(if (isConnected) "Conectado ao servidor" else "Desconectado do servidor")
            .setSmallIcon(R.drawable.ic_service_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .setPriority(Notification.PRIORITY_LOW)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
    
    fun isConnected(): Boolean {
        return webSocketClient?.isConnected() ?: false
    }
    
    fun sendMessage(message: String) {
        webSocketClient?.sendMessage(message)
    }
    
    fun sendDeviceStatus(deviceInfo: DeviceInfo) {
        webSocketClient?.sendDeviceStatus(deviceInfo)
    }
    
    fun disconnect() {
        webSocketClient?.disconnect()
    }
    
    fun setScreenActive(active: Boolean) {
        val wasActive = isScreenActive
        isScreenActive = active
        
        if (wasActive != active) {
            Log.d(TAG, "📱 Estado da tela mudou no Service: ${if (active) "ATIVA" else "INATIVA"}")
            
            // Notificar WebSocketClient sobre mudança de estado
            webSocketClient?.setScreenActive(active)
            
            if (active) {
                // Tela ativa - enviar status imediatamente
                sendDeviceStatusWithRealData()
            }
        }
    }
    
    /**
     * Notifica sobre mudança de rede para forçar reconexão
     */
    fun onNetworkChanged() {
        Log.d(TAG, "🌐 Mudança de rede detectada no WebSocketService")
        webSocketClient?.onNetworkChanged()
    }
    
    private fun showBackgroundNotification(title: String, body: String) {
        try {
            Log.d(TAG, "Exibindo notificação em background: $title - $body")
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Verificar se as notificações estão habilitadas
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                if (!notificationManager.areNotificationsEnabled()) {
                    Log.w(TAG, "Notificações desabilitadas pelo usuário")
                    return
                }
            }
            
            // Criar canal de notificação se necessário (Android 8+)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    "mdm_notifications",
                    "MDM Launcher Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notificações do MDM Launcher"
                    enableLights(true)
                    enableVibration(true)
                    setShowBadge(true)
                    setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION), null)
                }
                notificationManager.createNotificationChannel(channel)
            }
            
            // Intent para abrir o app quando clicar na notificação
            // IMPORTANTE: Usar FLAG_ACTIVITY_SINGLE_TOP para não recriar Activity
            val intent = Intent(this, com.mdm.launcher.MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("show_message_modal", true)
                putExtra("message_content", body)
            }
            
            val pendingIntent = PendingIntent.getActivity(
                this, 
                System.currentTimeMillis().toInt(), // ID único para cada notificação
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            // Criar notificação
            val notification = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                Notification.Builder(this, "mdm_notifications")
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(R.drawable.ic_service_notification)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .setDefaults(Notification.DEFAULT_ALL)
                    .setStyle(Notification.BigTextStyle().bigText(body))
                    .setCategory(Notification.CATEGORY_MESSAGE)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(R.drawable.ic_service_notification)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .setDefaults(Notification.DEFAULT_ALL)
                    .setStyle(Notification.BigTextStyle().bigText(body))
                    .build()
            }
            
            // Gerar ID único para a notificação
            val notificationId = System.currentTimeMillis().toInt()
            
            // Mostrar notificação
            notificationManager.notify(notificationId, notification)
            Log.d(TAG, "Notificação exibida em background com sucesso (ID: $notificationId)")
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao exibir notificação em background", e)
        }
    }
    
    private fun startHealthCheck() {
        // Cancelar verificação anterior se existir
        healthCheckJob?.cancel()
        
        // Iniciar verificação periódica de saúde da conexão a cada 60 segundos
        healthCheckJob = serviceScope.launch {
            while (isActive && isServiceRunning) {
                delay(60000L) // 60 segundos
                
                try {
                    val isConnected = webSocketClient?.isConnected() ?: false
                    Log.d(TAG, "🏥 Verificação de saúde: conectado=$isConnected")
                    
                    if (!isConnected) {
                        Log.w(TAG, "⚠️ WebSocket desconectado, verificando saúde...")
                        val isHealthy = webSocketClient?.checkConnectionHealth() ?: false
                        
                        if (!isHealthy) {
                            Log.w(TAG, "❌ Conexão não saudável, tentando reconectar...")
                            webSocketClient?.forceReconnect()
                        }
                    } else {
                        // Mesmo conectado, verificar saúde
                        webSocketClient?.checkConnectionHealth()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao verificar saúde da conexão", e)
                }
            }
        }
        
        Log.d(TAG, "✅ Verificação periódica de saúde iniciada (60s)")
    }
    
    private fun startNetworkMonitoring() {
        if (networkMonitor != null) {
            Log.d(TAG, "NetworkMonitor já está ativo")
            return
        }
        
        try {
            Log.d(TAG, "🌐 Iniciando monitoramento de rede...")
            networkMonitor = NetworkMonitor(this)
            
            networkMonitor?.startMonitoring { isConnected ->
                Log.d(TAG, "🔔 Mudança de conectividade detectada: $isConnected")
                
                if (isConnected) {
                    // Rede voltou - verificar se WebSocket está conectado
                    val isWebSocketConnected = webSocketClient?.isConnected() ?: false
                    
                    if (!isWebSocketConnected) {
                        Log.d(TAG, "🔄 Rede disponível mas WebSocket desconectado - reconectando...")
                        
                        serviceScope.launch {
                            delay(2000) // Aguardar rede estabilizar
                            webSocketClient?.onNetworkChanged()
                        }
                    } else {
                        Log.d(TAG, "✅ WebSocket já está conectado")
                    }
                } else {
                    Log.d(TAG, "❌ Conectividade de rede perdida")
                }
            }
            
            Log.d(TAG, "✅ NetworkMonitor iniciado com sucesso")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar NetworkMonitor", e)
        }
    }
    
    private fun handleNetworkChange() {
        Log.d(TAG, "🌐 Tratando mudança de rede...")
        webSocketClient?.onNetworkChanged()
    }
    
    private fun forceReconnect() {
        Log.d(TAG, "🔄 Forçando reconexão completa...")
        
        // Adquirir WakeLock temporário para garantir que reconexão complete
        wakeLock?.acquire(30000) // 30 segundos
        
        serviceScope.launch {
            try {
                webSocketClient?.forceReconnect()
                delay(5000) // Aguardar reconexão
                
                if (webSocketClient?.isConnected() == true) {
                    Log.d(TAG, "✅ Reconexão bem-sucedida")
                } else {
                    Log.w(TAG, "⚠️ Reconexão ainda em andamento...")
                }
            } finally {
                // Liberar WakeLock
                if (wakeLock?.isHeld == true) {
                    wakeLock?.release()
                }
            }
        }
    }
    
    /**
     * Desabilita outros launchers para garantir que o MDM Launcher seja o único
     */
    private fun disableOtherLaunchers() {
        synchronized(launcherLock) {
            try {
                val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                val componentName = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
                
                if (dpm.isDeviceOwnerApp(packageName)) {
                    val pm = packageManager
                    val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                        addCategory(Intent.CATEGORY_HOME)
                    }
                    
                    val allLaunchers = pm.queryIntentActivities(homeIntent, android.content.pm.PackageManager.MATCH_ALL)
                    Log.d(TAG, "🔍 Desabilitando ${allLaunchers.size - 1} launchers...")
                    
                    var disabledCount = 0
                    for (launcher in allLaunchers) {
                        val launcherPackage = launcher.activityInfo.packageName
                        if (launcherPackage != packageName) {
                            try {
                                // Desabilitar outros launchers novamente
                                val result = dpm.setApplicationHidden(componentName, launcherPackage, true)
                                Log.d(TAG, "🔒 Launcher $launcherPackage desabilitado: sucesso=$result")
                                if (result) {
                                    disabledCount++
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "❌ Erro ao desabilitar launcher $launcherPackage", e)
                            }
                        }
                    }
                    Log.d(TAG, "✅ Launchers desabilitados: $disabledCount de ${allLaunchers.size - 1}")
                    Log.d(TAG, "✅ Proteção reativada - MDM Launcher é o único disponível")
                } else {
                    Log.w(TAG, "⚠️ App não é Device Owner - não pode gerenciar launchers")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ ERRO CRÍTICO ao desabilitar launchers", e)
            }
        }
    }
    
    private fun performHealthCheck() {
        Log.d(TAG, "🏥 Realizando health check...")
        
        val isConnected = webSocketClient?.isConnected() ?: false
        val state = ConnectionStateManager.getConnectionState(this)
        
        Log.d(TAG, "Estado atual:")
        Log.d(TAG, "  - WebSocket conectado: $isConnected")
        Log.d(TAG, "  - Última conexão: ${state.lastConnectedTime}")
        Log.d(TAG, "  - Total de conexões: ${state.totalConnections}")
        
        if (!isConnected) {
            Log.w(TAG, "⚠️ WebSocket desconectado durante health check - reconectando...")
            forceReconnect()
        }
    }
}
