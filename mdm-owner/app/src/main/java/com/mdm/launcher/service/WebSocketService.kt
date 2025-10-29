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
import com.mdm.launcher.data.ReceivedMessage
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
                "com.mdm.launcher.SEND_USAGE_DATA" -> {
                    Log.d(TAG, "📊 === BROADCAST SEND_USAGE_DATA RECEBIDO ===")
                    Log.d(TAG, "📊 Intent action: ${intent.action}")
                    Log.d(TAG, "📊 Intent extras: ${intent.extras}")
                    val usageData = intent.getStringExtra("usage_data")
                    Log.d(TAG, "📊 Usage data recebido: $usageData")
                    if (usageData != null) {
                        Log.d(TAG, "📊 Chamando sendUsageDataToServer...")
                        sendUsageDataToServer(usageData)
                    } else {
                        Log.w(TAG, "⚠️ Usage data é null!")
                    }
                    Log.d(TAG, "📊 === FIM BROADCAST SEND_USAGE_DATA ===")
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
            addAction("com.mdm.launcher.SEND_USAGE_DATA")
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
        
        // Verificar se é um comando de envio de dados de uso
        if (intent?.action == "com.mdm.launcher.SEND_USAGE_DATA") {
            Log.d(TAG, "📊 === RECEBENDO DADOS VIA START_COMMAND ===")
            val usageData = intent.getStringExtra("usage_data")
            Log.d(TAG, "📊 Usage data recebido via startCommand: $usageData")
            if (usageData != null) {
                sendUsageDataToServer(usageData)
            }
            Log.d(TAG, "📊 === FIM START_COMMAND ===")
            return START_STICKY
        }
        
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
        
        // Cancelar health check com timeout
        try {
            healthCheckJob?.cancel()
            healthCheckJob = null
            Log.d(TAG, "Health check cancelado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao cancelar health check", e)
        }
        
        // Parar e limpar NetworkMonitor com verificação de estado
        try {
            networkMonitor?.let {
                try {
                    it.stopMonitoring()
                    it.destroy()
                    networkMonitor = null
                    Log.d(TAG, "NetworkMonitor limpo")
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao limpar NetworkMonitor", e)
                    networkMonitor = null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar NetworkMonitor", e)
        }
        
        // Desregistrar BroadcastReceiver com verificação de estado
        try {
            unregisterReceiver(commandReceiver)
            Log.d(TAG, "BroadcastReceiver desregistrado")
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "BroadcastReceiver já estava desregistrado")
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao desregistrar receiver", e)
        }
        
        // Liberar WakeLock com verificação de estado
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "WakeLock liberado")
                }
                wakeLock = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar WakeLock", e)
        }
        
        // Cleanup WebSocket com verificação de estado
        try {
            webSocketClient?.let {
                if (it.isConnected()) {
                    it.disconnect()
                }
                it.cleanup()
                webSocketClient = null
                Log.d(TAG, "WebSocketClient limpo")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar WebSocketClient", e)
        }
        
        // Cancelar scope de coroutines com timeout
        try {
            if (serviceScope.isActive) {
                serviceScope.cancel()
                Log.d(TAG, "ServiceScope cancelado")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao cancelar serviceScope", e)
        }
        
        // Limpar referências para evitar vazamentos
        isInitializing = false
        lastReconnectingTime = 0L
        
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
            
            // Descobrir servidor automaticamente com resiliência
            val serverUrl = try {
                com.mdm.launcher.utils.ServerDiscovery.discoverServer(this)
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro na descoberta inicial do servidor: ${e.message}")
                Log.d(TAG, "🔄 Tentando redescoberta forçada...")
                
                // Tentar redescoberta forçada
                try {
                    com.mdm.launcher.utils.ServerDiscovery.forceRediscovery(this)
                } catch (e2: Exception) {
                    Log.e(TAG, "❌ Redescoberta forçada também falhou: ${e2.message}")
                    throw e2 // Re-throw o erro original
                }
            }
            Log.d(TAG, "🎯 Servidor descoberto no Service: $serverUrl")
            
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
                    Log.d(TAG, "═══════════════════════════════════════════════")
                    Log.d(TAG, "🔗 STATUS DE CONEXÃO MUDOU: $connected")
                    Log.d(TAG, "═══════════════════════════════════════════════")
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
                        Log.w(TAG, "⏳ Aguardando conexão ser estabelecida...")
                        // Tentar novamente após mais 3s
                        delay(3000)
                        if (webSocketClient?.isConnected() == true) {
                            Log.d(TAG, "✅ Conexão estabelecida (2ª tentativa) - enviando device_status")
                            sendDeviceStatusWithRealData()
                        }
                    }
                }
            } else {
                Log.d(TAG, "✅ WebSocket já está conectado - enviando device_status")
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
            Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d(TAG, "📨 PROCESSANDO MENSAGEM EM BACKGROUND (SERVICE)")
            Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d(TAG, "Mensagem completa: $message")
            
            // Parse da mensagem JSON
            val gson = com.google.gson.Gson()
            val jsonObject = gson.fromJson(message, Map::class.java)
            val type = jsonObject["type"] as? String
            
            Log.d(TAG, "📋 Tipo de mensagem identificado: '$type'")
            Log.d(TAG, "📋 JSON object keys: ${jsonObject.keys}")
            
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
                        
                        Log.d(TAG, "═══════════════════════════════════════════════════════════")
                        Log.d(TAG, "📱 PROCESSANDO PERMISSÕES DE APPS NO SERVICE")
                        Log.d(TAG, "═══════════════════════════════════════════════════════════")
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
                            
                            // 🎯 ATUALIZAR MONITOR DE APPS
                            val allowedAppsStrings = allowedAppsList.mapNotNull { it as? String }
                            com.mdm.launcher.utils.AppMonitor.updateAllowedApps(this, allowedAppsStrings)
                            Log.d(TAG, "✅ Monitor de apps atualizado com ${allowedAppsStrings.size} apps permitidos")
                            Log.d(TAG, "Apps: $allowedAppsList")
                            
                            // 🎯 ATUALIZAR APPUSAGETRACKER
                            val appUsageTracker = com.mdm.launcher.utils.AppUsageTracker(this)
                            appUsageTracker.updateAllowedApps(allowedAppsStrings)
                            Log.d(TAG, "✅ AppUsageTracker atualizado com ${allowedAppsStrings.size} apps permitidos")
                        }
                        
                        Log.d(TAG, "═══════════════════════════════════════════════════════════")
                        
                        // Encaminhar para MainActivity via Broadcast com FLAG explícito
                        val intent = Intent("com.mdm.launcher.UPDATE_APP_PERMISSIONS")
                        intent.setPackage(packageName) // Garantir que vai para nosso app
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
                    Log.d(TAG, "🗑️ ════════════════════════════════════════════════════════════════════════════════")
                    Log.d(TAG, "🗑️ COMANDO: LIMPAR HISTÓRICO DE LOCALIZAÇÃO")
                    Log.d(TAG, "🗑️ ════════════════════════════════════════════════════════════════════════════════")
                    
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
                    
                    Log.d(TAG, "🗑️ ════════════════════════════════════════════════════════════════════════════════")
                }
                "remove_device_owner" -> {
                    Log.d(TAG, "🔓 ════════════════════════════════════════════════════════════════════════════════")
                    Log.d(TAG, "🔓 COMANDO: REMOVER DEVICE OWNER")
                    Log.d(TAG, "🔓 ════════════════════════════════════════════════════════════════════════════════")
                    
                    try {
                        val data = jsonObject["data"] as? Map<*, *>
                        val password = data?.get("password") as? String
                        
                        if (password.isNullOrEmpty()) {
                            Log.e(TAG, "❌ Senha não fornecida")
                            val errorMessage = mapOf(
                                "type" to "device_owner_removed",
                                "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                                "timestamp" to System.currentTimeMillis(),
                                "success" to false,
                                "error" to "Senha não fornecida"
                            )
                            webSocketClient?.sendMessage(gson.toJson(errorMessage))
                            return
                        }
                        
                        Log.d(TAG, "🔐 Verificando senha de administrador...")
                        
                        val success = removeDeviceOwner(password)
                        
                        val responseMessage = mapOf(
                            "type" to "device_owner_removed",
                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                            "timestamp" to System.currentTimeMillis(),
                            "success" to success,
                            "message" to if (success) {
                                "Device Owner removido com sucesso! Você pode desinstalar o app."
                            } else {
                                "Não foi possível remover via API. Use ADB: adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver --user 0"
                            }
                        )
                        
                        webSocketClient?.sendMessage(gson.toJson(responseMessage))
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro ao processar remoção de Device Owner", e)
                        val errorMessage = mapOf(
                            "type" to "device_owner_removed",
                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                            "timestamp" to System.currentTimeMillis(),
                            "success" to false,
                            "error" to e.message
                        )
                        webSocketClient?.sendMessage(gson.toJson(errorMessage))
                    }
                    
                    Log.d(TAG, "🔓 ════════════════════════════════════════════════════════════════════════════════")
                }
                "emergency_disable" -> {
                    Log.d(TAG, "🚨 ════════════════════════════════════════════════════════════════════════════════")
                    Log.d(TAG, "🚨 MODO DE EMERGÊNCIA ATIVADO")
                    Log.d(TAG, "🚨 ════════════════════════════════════════════════════════════════════════════════")
                    
                    try {
                        val data = jsonObject["data"] as? Map<*, *>
                        val password = data?.get("password") as? String
                        
                        // Verificar senha
                        val prefs = getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
                        val adminPassword = prefs.getString("admin_password", "admin123") ?: "admin123"
                        
                        if (password != adminPassword) {
                            Log.e(TAG, "❌ Senha incorreta")
                            val errorMessage = mapOf(
                                "type" to "emergency_disabled",
                                "success" to false,
                                "error" to "Senha incorreta"
                            )
                            webSocketClient?.sendMessage(gson.toJson(errorMessage))
                            return
                        }
                        
                        Log.d(TAG, "🚨 DESATIVANDO TUDO - MODO DE EMERGÊNCIA")
                        
                        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                        val componentName = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
                        
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            // 1. Remover TODAS as restrições possíveis
                            Log.d(TAG, "1️⃣ Removendo TODAS as restrições...")
                            val allRestrictions = listOf(
                                android.os.UserManager.DISALLOW_ADJUST_VOLUME,
                                android.os.UserManager.DISALLOW_FACTORY_RESET,
                                android.os.UserManager.DISALLOW_ADD_USER,
                                android.os.UserManager.DISALLOW_CONFIG_CREDENTIALS,
                                android.os.UserManager.DISALLOW_CONFIG_WIFI,
                                android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH,
                                android.os.UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
                                android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS,
                                android.os.UserManager.DISALLOW_REMOVE_USER,
                                android.os.UserManager.DISALLOW_SHARE_LOCATION,
                                android.os.UserManager.DISALLOW_UNINSTALL_APPS,
                                android.os.UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS,
                                android.os.UserManager.DISALLOW_SAFE_BOOT,
                                android.os.UserManager.DISALLOW_DEBUGGING_FEATURES,
                                android.os.UserManager.DISALLOW_APPS_CONTROL
                            )
                            
                            for (restriction in allRestrictions) {
                                try {
                                    dpm.clearUserRestriction(componentName, restriction)
                                } catch (e: Exception) {
                                    // Ignora erros
                                }
                            }
                            
                            // 2. Reabilitar TODOS os launchers
                            Log.d(TAG, "2️⃣ Reabilitando TODOS os launchers...")
                            synchronized(launcherLock) {
                                val packageManager = packageManager
                                val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                                    addCategory(Intent.CATEGORY_HOME)
                                }
                                
                                val allLaunchers = packageManager.queryIntentActivities(homeIntent, android.content.pm.PackageManager.MATCH_ALL)
                                
                                for (launcher in allLaunchers) {
                                    if (launcher.activityInfo.packageName != packageName) {
                                        try {
                                            dpm.setApplicationHidden(componentName, launcher.activityInfo.packageName, false)
                                            Log.d(TAG, "✅ Reabilitado: ${launcher.activityInfo.packageName}")
                                        } catch (e: Exception) {
                                            // Ignora
                                        }
                                    }
                                }
                            }
                            
                            // 3. Desativar modo kiosk
                            Log.d(TAG, "3️⃣ Desativando modo kiosk...")
                            try {
                                dpm.clearPackagePersistentPreferredActivities(componentName, packageName)
                            } catch (e: Exception) {}
                            
                            // 4. Limpar lockTaskPackages
                            try {
                                dpm.setLockTaskPackages(componentName, emptyArray())
                            } catch (e: Exception) {}
                            
                            Log.d(TAG, "✅ ════════════════════════════════════════════════════════════════════════════════")
                            Log.d(TAG, "✅ MODO DE EMERGÊNCIA COMPLETO!")
                            Log.d(TAG, "✅ ════════════════════════════════════════════════════════════════════════════════")
                            Log.d(TAG, "ℹ️ AGORA você pode:")
                            Log.d(TAG, "  1. Acessar Configurações normalmente")
                            Log.d(TAG, "  2. Desinstalar o app manualmente")
                            Log.d(TAG, "  3. Usar ADB: adb uninstall com.mdm.launcher")
                            Log.d(TAG, "  4. Escolher outro launcher")
                            Log.d(TAG, "✅ ════════════════════════════════════════════════════════════════════════════════")
                            
                            val responseMessage = mapOf(
                                "type" to "emergency_disabled",
                                "success" to true,
                                "message" to "Modo de emergência ativado! Todas as restrições removidas. Você pode acessar configurações e desinstalar o app."
                            )
                            webSocketClient?.sendMessage(gson.toJson(responseMessage))
                            
                        } else {
                            Log.w(TAG, "⚠️ Não é Device Owner")
                            val errorMessage = mapOf(
                                "type" to "emergency_disabled",
                                "success" to false,
                                "error" to "Não é Device Owner"
                            )
                            webSocketClient?.sendMessage(gson.toJson(errorMessage))
                        }
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro no modo de emergência", e)
                        val errorMessage = mapOf(
                            "type" to "emergency_disabled",
                            "success" to false,
                            "error" to e.message
                        )
                        webSocketClient?.sendMessage(gson.toJson(errorMessage))
                    }
                    
                    Log.d(TAG, "🚨 ════════════════════════════════════════════════════════════════════════════════")
                }
                "update_app" -> {
                    Log.d(TAG, "📱 ════════════════════════════════════════════════════════════════════════════════")
                    Log.d(TAG, "📱 COMANDO: ATUALIZAR APLICATIVO")
                    Log.d(TAG, "📱 ════════════════════════════════════════════════════════════════════════════════")
                    
                    try {
                        val data = jsonObject["data"] as? Map<*, *>
                        val apkUrl = data?.get("apk_url") as? String
                        val version = data?.get("version") as? String
                        
                        if (apkUrl.isNullOrEmpty()) {
                            Log.e(TAG, "❌ URL do APK não fornecida")
                            sendUpdateStatus(false, "URL do APK não fornecida")
                            return
                        }
                        
                        Log.d(TAG, "🔗 URL do APK: $apkUrl")
                        Log.d(TAG, "🏷️ Versão: ${version ?: "não especificada"}")
                        
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
                    
                    Log.d(TAG, "📱 ════════════════════════════════════════════════════════════════════════════════")
                }
                "show_notification" -> {
                    Log.d(TAG, "═══════════════════════════════════════════════════════════════════════════════")
                    Log.d(TAG, "🔔 SHOW_NOTIFICATION RECEBIDO (SERVICE)")
                    Log.d(TAG, "═══════════════════════════════════════════════════════════════════════════════")
                    
                    val dataMap = jsonObject["data"] as? Map<*, *> ?: jsonObject
                    val title = dataMap["title"] as? String ?: "MDM Launcher"
                    val body = dataMap["body"] as? String ?: "Nova notificação"
                    
                    Log.d(TAG, "📋 Dados extraídos:")
                    Log.d(TAG, "  - Título: $title")
                    Log.d(TAG, "  - Corpo: $body")
                    Log.d(TAG, "  - dataMap: $dataMap")
                    
                    // SALVAR NO HISTÓRICO DE MENSAGENS
                    val fullMessage = if (title != "MDM Launcher") "$title\n$body" else body
                    Log.d(TAG, "💾 Mensagem completa a ser salva: $fullMessage")
                    
                    saveMessageToHistory(fullMessage)
                    Log.d(TAG, "✅ saveMessageToHistory() chamado")
                    
                    // Mostrar notificação em background
                    showBackgroundNotification(title, body)
                    Log.d(TAG, "🔔 Notificação em background exibida")
                    
                    // Enviar confirmação de recebimento
                    val confirmationMessage = mapOf(
                        "type" to "notification_received",
                        "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                        "title" to title,
                        "body" to body,
                        "timestamp" to System.currentTimeMillis()
                    )
                    webSocketClient?.sendMessage(gson.toJson(confirmationMessage))
                    Log.d(TAG, "✅ Confirmação de notificação enviada ao servidor")
                    Log.d(TAG, "═══════════════════════════════════════════════════════════════════════════════")
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
                        Log.d(TAG, "📡 Broadcast enviado para MainActivity recarregar senha")
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
                    Log.w(TAG, "⚠️ Tipo de mensagem não processado em background: '$type'")
                    Log.w(TAG, "⚠️ Mensagem: $message")
                }
            }
            Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao processar mensagem em background", e)
            e.printStackTrace()
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
                    osType = "Android",
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
                    meid = null,
                    installedAppsCount = 0,
                    installedApps = emptyList(),
                    allowedApps = emptyList(),
                    apiLevel = android.os.Build.VERSION.SDK_INT,
                    timezone = java.util.TimeZone.getDefault().id,
                    language = java.util.Locale.getDefault().language,
                    country = java.util.Locale.getDefault().country,
                    complianceStatus = "unknown"
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
            
            // Intent para abrir o app, mostrar modal e marcar mensagem como lida quando clicar na notificação
            val intent = Intent(this, com.mdm.launcher.MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("mark_message_as_read", true)
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
    
    private fun saveMessageToHistory(message: String) {
        try {
            Log.d(TAG, "💾 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d(TAG, "💾 SALVANDO NOVA MENSAGEM NO HISTÓRICO")
            Log.d(TAG, "💾 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d(TAG, "Mensagem recebida: $message")
            
            val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            Log.d(TAG, "SharedPreferences obtido: ${prefs != null}")
            
            // Carregar mensagens existentes
            val messagesJson = prefs.getString("received_messages", null)
            Log.d(TAG, "JSON atual (primeiros 200 chars): ${messagesJson?.take(200) ?: "null"}")
            
            val messages = if (messagesJson != null && messagesJson.isNotEmpty()) {
                try {
                    val type = object : com.google.gson.reflect.TypeToken<MutableList<ReceivedMessage>>() {}.type
                    val parsed = com.google.gson.Gson().fromJson<MutableList<ReceivedMessage>>(messagesJson, type)
                    Log.d(TAG, "✅ JSON parseado com sucesso: ${parsed?.size ?: 0} mensagens")
                    parsed ?: mutableListOf()
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Erro ao fazer parse do JSON existente", e)
                    mutableListOf()
                }
            } else {
                Log.d(TAG, "Sem mensagens anteriores - criando lista nova")
                mutableListOf()
            }
            
            Log.d(TAG, "📊 Mensagens antes de adicionar: ${messages.size}")
            messages.forEachIndexed { index, msg ->
                Log.d(TAG, "  [$index] ${msg.message.take(30)}... (ID=${msg.id})")
            }
            
            // Adicionar nova mensagem no início
            val newMessage = ReceivedMessage(
                id = "msg_${System.currentTimeMillis()}_${(Math.random() * 10000).toInt()}",
                message = message,
                timestamp = System.currentTimeMillis(),
                read = false
            )
            messages.add(0, newMessage)
            Log.d(TAG, "➕ Nova mensagem adicionada: ID=${newMessage.id}")
            
            // LIMITE: Manter apenas as 5 mensagens mais recentes
            if (messages.size > 5) {
                val removedMessages = messages.size - 5
                val removedList = messages.subList(5, messages.size).toList()
                messages.subList(5, messages.size).clear()
                Log.d(TAG, "🗑️ Removidas $removedMessages mensagens antigas (limite: 5)")
                removedList.forEach { removed ->
                    Log.d(TAG, "  🗑️ Removida: ${removed.message.take(30)}... (ID=${removed.id})")
                }
            }
            
            Log.d(TAG, "📊 Mensagens após adicionar: ${messages.size}")
            messages.forEachIndexed { index, msg ->
                Log.d(TAG, "  [$index] ${msg.message.take(30)}... (ID=${msg.id}, Lida=${msg.read})")
            }
            
            // Salvar de volta usando apply() em background thread
            val updatedJson = com.google.gson.Gson().toJson(messages)
            Log.d(TAG, "💾 Salvando JSON (primeiros 300 chars): ${updatedJson.take(300)}")
            
            // Usar apply() em vez de commit() para evitar ANR
            val success = prefs.edit().putString("received_messages", updatedJson).apply()
            Log.d(TAG, "💾 SharedPreferences apply() executado")
            
            // Verificar se realmente salvou (opcional, apenas para debug)
            val verification = prefs.getString("received_messages", null)
            val verificationMatches = verification == updatedJson
            Log.d(TAG, "🔍 Verificação - JSON foi salvo corretamente: $verificationMatches")
            Log.d(TAG, "🔍 JSON verificado (primeiros 200 chars): ${verification?.take(200) ?: "null"}")
            
            // Enviar broadcast para MainActivity atualizar badge
            val unreadCount = messages.count { !it.read }
            val intent = Intent("com.mdm.launcher.MESSAGE_RECEIVED")
            intent.putExtra("unread_count", unreadCount)
            intent.setPackage(packageName) // Garantir que vai para o próprio app
            
            Log.d(TAG, "📡 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d(TAG, "📡 ENVIANDO BROADCAST MESSAGE_RECEIVED")
            Log.d(TAG, "📡 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d(TAG, "Action: com.mdm.launcher.MESSAGE_RECEIVED")
            Log.d(TAG, "Unread count: $unreadCount")
            Log.d(TAG, "Package: $packageName")
            Log.d(TAG, "Total mensagens: ${messages.size}")
            
            sendBroadcast(intent)
            
            Log.d(TAG, "✅ Broadcast enviado com sucesso!")
            Log.d(TAG, "📊 RESUMO: ${messages.size} mensagens no histórico, $unreadCount não lidas")
            Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        } catch (e: Exception) {
            Log.e(TAG, "❌❌❌ ERRO CRÍTICO ao salvar mensagem no histórico ❌❌❌", e)
            e.printStackTrace()
        }
    }
    
    private var lastReconnectingTime = 0L
    private val MAX_RECONNECTING_TIME = 120000L // 2 minutos máximo em estado de reconexão
    
    private fun startHealthCheck() {
        // Cancelar verificação anterior se existir
        healthCheckJob?.cancel()
        
        // Verificação periódica com timeout e condições de saída
        healthCheckJob = serviceScope.launch {
            var checkCount = 0
            val maxChecks = 60 // Máximo 1 hora (60 * 60s)
            
            while (isActive && isServiceRunning && checkCount < maxChecks) {
                delay(60000L) // 60 segundos
                checkCount++
                
                try {
                    val isConnected = webSocketClient?.isConnected() ?: false
                    val isReconnecting = webSocketClient?.isReconnecting() ?: false
                    val now = System.currentTimeMillis()
                    
                    Log.d(TAG, "🏥 Verificação de saúde: conectado=$isConnected, reconectando=$isReconnecting")
                    
                    // Condição de saída: se conectado e estável
                    if (isConnected && !isReconnecting) {
                        Log.d(TAG, "✅ Conexão estável - reduzindo frequência de verificação")
                        // Reduzir frequência para 5 minutos quando estável
                        delay(240000L) // 4 minutos adicionais
                        continue
                    }
                    
                    // Se está reconectando, verificar há quanto tempo
                    if (isReconnecting) {
                        if (lastReconnectingTime == 0L) {
                            lastReconnectingTime = now
                            Log.d(TAG, "⏳ Reconexão iniciada, monitorando...")
                        } else {
                            val timeReconnecting = now - lastReconnectingTime
                            
                            if (timeReconnecting > MAX_RECONNECTING_TIME) {
                                Log.w(TAG, "⚠️ TRAVADO em reconexão por ${timeReconnecting/1000}s - FORÇANDO RESET!")
                                lastReconnectingTime = 0L
                                
                                // Invalidar cache do servidor
                                com.mdm.launcher.utils.ServerDiscovery.invalidateCache()
                                
                                // Forçar reconexão completa
                                webSocketClient?.forceReconnect()
                            } else {
                                Log.d(TAG, "⏳ Reconexão em andamento há ${timeReconnecting/1000}s...")
                            }
                        }
                    } else {
                        // Resetar contador se não está mais reconectando
                        if (lastReconnectingTime != 0L) {
                            lastReconnectingTime = 0L
                            Log.d(TAG, "✅ Saiu do estado de reconexão")
                        }
                        
                        if (!isConnected) {
                            // Desconectado e não está reconectando: verificar saúde
                            Log.w(TAG, "⚠️ WebSocket desconectado, verificando saúde...")
                            
                            // Verificar saúde do servidor usando ServerDiscovery
                            val serverHealthy = com.mdm.launcher.utils.ServerDiscovery.checkServerHealth()
                            val connectionHealthy = webSocketClient?.checkConnectionHealth() ?: false
                            
                            if (!serverHealthy) {
                                Log.w(TAG, "❌ Servidor não saudável - invalidando cache e forçando redescoberta")
                                com.mdm.launcher.utils.ServerDiscovery.invalidateCache()
                            }
                            
                            if (!connectionHealthy || !serverHealthy) {
                                Log.w(TAG, "❌ Conexão não saudável, tentando reconectar...")
                                webSocketClient?.forceReconnect()
                            }
                        } else {
                            // Conectado: verificar saúde do servidor periodicamente
                            val serverHealthy = com.mdm.launcher.utils.ServerDiscovery.checkServerHealth()
                            if (!serverHealthy) {
                                Log.w(TAG, "⚠️ Servidor não saudável detectado durante conexão ativa")
                                com.mdm.launcher.utils.ServerDiscovery.invalidateCache()
                            }
                            
                            // Verificar saúde da conexão silenciosamente
                            webSocketClient?.checkConnectionHealth()
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao verificar saúde da conexão", e)
                }
            }
            
            if (checkCount >= maxChecks) {
                Log.w(TAG, "⚠️ Timeout atingido no health check - parando verificação")
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
                Log.d(TAG, "🔗 Mudança de conectividade detectada: $isConnected")
                
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
                                Log.d(TAG, "🚫 Launcher $launcherPackage desabilitado: sucesso=$result")
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
    
    /**
     * Remove o Device Owner do dispositivo
     * Permite remover o MDM completamente via comando remoto
     * Requer senha de administrador para segurança
     */
    private fun removeDeviceOwner(password: String): Boolean {
        try {
            Log.d(TAG, "🔓 ════════════════════════════════════════════════════════════════════════════════")
            Log.d(TAG, "🔓 TENTANDO REMOVER DEVICE OWNER")
            Log.d(TAG, "🔓 ════════════════════════════════════════════════════════════════════════════════")
            
            // Verificar senha de administrador
            val prefs = getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            val adminPassword = prefs.getString("admin_password", "admin123") ?: "admin123"
            
            if (password != adminPassword) {
                Log.e(TAG, "❌ Senha de administrador incorreta!")
                return false
            }
            
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val componentName = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
            
            if (!dpm.isDeviceOwnerApp(packageName)) {
                Log.w(TAG, "⚠️ App não é Device Owner")
                return false
            }
            
            Log.d(TAG, "🔓 Removendo todas as restrições primeiro...")
            
            // Remover todas as restrições
            val restrictions = listOf(
                android.os.UserManager.DISALLOW_FACTORY_RESET,
                android.os.UserManager.DISALLOW_ADD_USER,
                android.os.UserManager.DISALLOW_CONFIG_CREDENTIALS,
                android.os.UserManager.DISALLOW_CONFIG_WIFI,
                android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH,
                android.os.UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
                android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS,
                android.os.UserManager.DISALLOW_REMOVE_USER,
                android.os.UserManager.DISALLOW_UNINSTALL_APPS,
                android.os.UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS,
                android.os.UserManager.DISALLOW_SAFE_BOOT
            )
            
            for (restriction in restrictions) {
                try {
                    dpm.clearUserRestriction(componentName, restriction)
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Erro ao remover restrição: $restriction")
                }
            }
            
            Log.d(TAG, "✅ Restrições removidas")
            
            // Tentar remover Device Owner
            Log.d(TAG, "🔓 Tentando remover Device Owner...")
            
            try {
                @Suppress("DEPRECATION")
                dpm.clearDeviceOwnerApp(packageName)
                
                Log.d(TAG, "✅ DEVICE OWNER REMOVIDO COM SUCESSO!")
                Log.d(TAG, "ℹ️ Agora você pode desinstalar o app normalmente")
                
                return true
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Não foi possível remover Device Owner via API: ${e.message}")
                Log.e(TAG, "ℹ️ Use ADB: adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver --user 0")
                
                return false
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao tentar remover Device Owner", e)
            return false
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
    
    private fun sendUsageDataToServer(usageData: String) {
        try {
            Log.d(TAG, "📊 === ENVIANDO DADOS DE USO VIA WEBSOCKET ===")
            Log.d(TAG, "📊 Dados recebidos: $usageData")
            Log.d(TAG, "📊 WebSocket conectado: ${webSocketClient?.isConnected()}")
            
            if (webSocketClient?.isConnected() == true) {
                webSocketClient?.sendMessage(usageData)
                Log.d(TAG, "✅ Dados de uso enviados com sucesso via WebSocket")
            } else {
                Log.w(TAG, "⚠️ WebSocket não conectado - dados de uso não enviados")
                Log.w(TAG, "⚠️ Tentando reconectar...")
                // Tentar reconectar se não estiver conectado
                serviceScope.launch {
                    initializeWebSocket()
                }
            }
            Log.d(TAG, "📊 === FIM ENVIO DADOS WEBSOCKET ===")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao enviar dados de uso", e)
        }
    }
}