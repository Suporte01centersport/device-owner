package com.mdm.launcher.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.mdm.launcher.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.network.WebSocketClient
import kotlinx.coroutines.*

class WebSocketService : Service() {
    
    private val binder = LocalBinder()
    private var webSocketClient: WebSocketClient? = null
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isServiceRunning = false
    
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
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "WebSocketService iniciado")
        startForeground(NOTIFICATION_ID, createNotification())
        isServiceRunning = true
        
        // Iniciar conexão WebSocket em background
        serviceScope.launch {
            initializeWebSocket()
        }
        
        return START_STICKY // Reiniciar automaticamente se for morto
    }
    
    override fun onBind(intent: Intent?): IBinder {
        return binder
    }
    
    override fun onDestroy() {
        Log.d(TAG, "WebSocketService destruído")
        isServiceRunning = false
        webSocketClient?.disconnect()
        serviceScope.cancel()
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
            Log.d(TAG, "🔧 Inicializando WebSocket em background")
            
            // Descobrir servidor automaticamente
            val serverUrl = com.mdm.launcher.utils.ServerDiscovery.discoverServer(this)
            Log.d(TAG, "🔍 Servidor descoberto no Service: $serverUrl")
            
            val deviceId = android.provider.Settings.Secure.getString(
                contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            ) ?: "unknown-device"
            
            Log.d(TAG, "📱 DeviceId: ${deviceId.takeLast(4)}")
            
            // Destruir instância antiga se existir
            WebSocketClient.destroyInstance()
            Log.d(TAG, "🗑️ Instância antiga destruída")
            
            webSocketClient = WebSocketClient.getInstance(
                serverUrl = serverUrl,
                deviceId = deviceId,
                onMessage = { message ->
                    Log.d(TAG, "Mensagem recebida em background: $message")
                    // Processar mensagens em background
                    processBackgroundMessage(message)
                },
                onConnectionChange = { isConnected ->
                    Log.d(TAG, "Status da conexão em background: $isConnected")
                    updateNotification(isConnected)
                    
                    // Quando conectar, coletar e enviar dados completos
                    if (isConnected) {
                        Log.d(TAG, "📤 Conexão estabelecida no Service - enviando dados completos...")
                        sendDeviceStatusWithRealData()
                    }
                }
            )
            
            Log.d(TAG, "🚀 Iniciando conexão WebSocket...")
            webSocketClient?.connect()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao inicializar WebSocket em background", e)
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
                    // Encaminhar para MainActivity processar
                    val intent = Intent("com.mdm.launcher.UPDATE_APP_PERMISSIONS")
                    intent.putExtra("message", message)
                    sendBroadcast(intent)
                    Log.d(TAG, "Broadcast enviado para MainActivity processar permissões")
                }
                "request_location" -> {
                    Log.d(TAG, "Localização solicitada em background")
                    // Implementar envio de localização em background
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
                        "deviceId" to android.provider.Settings.Secure.getString(
                            contentResolver,
                            android.provider.Settings.Secure.ANDROID_ID
                        ),
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
                        
                        // Mostrar notificação
                        showBackgroundNotification("Senha Configurada", "Senha de administrador foi configurada com sucesso!")
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
                else -> {
                    Log.d(TAG, "Tipo de mensagem não processado em background: $type")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem em background", e)
        }
    }
    
    private fun sendDeviceStatus() {
        serviceScope.launch {
            try {
                val deviceInfo = DeviceInfo(
                    deviceId = android.provider.Settings.Secure.getString(
                        contentResolver,
                        android.provider.Settings.Secure.ANDROID_ID
                    ) ?: "unknown-device",
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
                    serialNumber = android.os.Build.SERIAL,
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
                val deviceInfo = com.mdm.launcher.utils.DeviceInfoCollector.collectDeviceInfo(
                    this@WebSocketService, 
                    customName = null
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
    
    fun disconnect() {
        webSocketClient?.disconnect()
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
}
