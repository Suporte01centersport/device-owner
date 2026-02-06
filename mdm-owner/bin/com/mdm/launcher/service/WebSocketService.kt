package com.mdm.launcher.service

import android.app.*
import android.content.*
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import com.mdm.launcher.activities.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.network.WebSocketClient
import com.mdm.launcher.utils.ConnectionStateManager
import com.mdm.launcher.utils.DeviceInfoCollector
import com.mdm.launcher.utils.NetworkMonitor
import kotlinx.coroutines.*

class WebSocketService : Service() {
    
    private val binder = LocalBinder()
    private var webSocketClient: WebSocketClient? = null
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var isServiceRunning = false
    @Volatile private var isInitializing = false
    private var healthCheckJob: Job? = null
    @Volatile private var isScreenActive = true
    private var networkMonitor: NetworkMonitor? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    
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
        
        val filter = IntentFilter().apply {
            addAction("com.mdm.launcher.NETWORK_CHANGE")
            addAction("com.mdm.launcher.FORCE_RECONNECT")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, filter)
        }
        
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MDMLauncher::WebSocketWakeLock")
        ConnectionStateManager.scheduleHealthChecks(this)
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        isServiceRunning = true
        
        // Garantir que o serviço de localização esteja rodando
        val locIntent = Intent(this, LocationService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(locIntent)
        } else {
            startService(locIntent)
        }
        
        if (intent?.action == "com.mdm.launcher.SEND_MESSAGE") {
            val message = intent.getStringExtra("message")
            if (message != null && webSocketClient?.isConnected() == true) {
                webSocketClient?.sendMessage(message)
            }
            return START_STICKY
        }
        
        if (intent?.action == "com.mdm.launcher.SEND_DEVICE_STATUS") {
            sendDeviceStatusWithRealData()
            return START_STICKY
        }
        
        if (webSocketClient == null && !isInitializing) {
            serviceScope.launch { initializeWebSocket() }
        } else if (webSocketClient != null && webSocketClient?.isConnected() == false) {
            webSocketClient?.connect()
        }
        
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder = binder
    
    override fun onDestroy() {
        isServiceRunning = false
        healthCheckJob?.cancel()
        networkMonitor?.stopMonitoring()
        try { unregisterReceiver(commandReceiver) } catch (e: Exception) {}
        if (wakeLock?.isHeld == true) wakeLock?.release()
        webSocketClient?.disconnect()
        serviceScope.cancel()
        super.onDestroy()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
                description = CHANNEL_DESCRIPTION
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM Launcher")
            .setContentText("Conectado ao servidor")
            .setSmallIcon(R.drawable.ic_service_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
    
    private suspend fun initializeWebSocket() {
        try {
            isInitializing = true
            val serverUrl = com.mdm.launcher.utils.ServerDiscovery.discoverServer(this)
            val deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
            
            webSocketClient = WebSocketClient.getInstance(
                serverUrl = serverUrl,
                deviceId = deviceId,
                onMessage = { processBackgroundMessage(it) },
                onConnectionChange = { connected ->
                    updateNotification(connected)
                    ConnectionStateManager.saveConnectionState(this@WebSocketService, connected)
                    if (connected) sendDeviceStatusWithRealData()
                }
            )
            
            startNetworkMonitoring()
            if (webSocketClient?.isConnected() != true) webSocketClient?.connect()
            startHealthCheck()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao inicializar WebSocket", e)
        } finally {
            isInitializing = false
        }
    }
    
    private fun processBackgroundMessage(message: String) {
        try {
            val gson = com.google.gson.Gson()
            val jsonObject = gson.fromJson(message, Map::class.java)
            val type = jsonObject["type"] as? String
            
            when (type) {
                "device_status" -> sendDeviceStatus()
                "ping" -> webSocketClient?.sendMessage("""{"type":"pong","timestamp":${System.currentTimeMillis()}}""")
                "update_app_permissions" -> {
                    val data = jsonObject["data"] as? Map<*, *>
                    val allowedAppsList = data?.get("allowedApps") as? List<*>
                    if (allowedAppsList != null) {
                        val sharedPreferences = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                        sharedPreferences.edit().putString("allowed_apps", gson.toJson(allowedAppsList)).apply()
                        val intent = Intent("com.mdm.launcher.UPDATE_APP_PERMISSIONS")
                        intent.setPackage(packageName)
                        intent.putExtra("message", message)
                        sendBroadcast(intent)
                    }
                }
                "show_notification" -> {
                    val dataMap = jsonObject["data"] as? Map<*, *> ?: jsonObject
                    val title = dataMap["title"] as? String ?: "MDM Launcher"
                    val body = dataMap["body"] as? String ?: "Nova notificação"
                    com.mdm.launcher.utils.MessageManager.saveMessage(this, if (title != "MDM Launcher") "$title\n$body" else body)
                    showBackgroundNotification(title, body)
                    webSocketClient?.sendMessage(gson.toJson(mapOf("type" to "notification_received", "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this), "timestamp" to System.currentTimeMillis())))
                }
                "set_admin_password" -> {
                    val data = jsonObject["data"] as? Map<*, *>
                    val password = data?.get("password") as? String
                    if (!password.isNullOrEmpty()) {
                        getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE).edit().putString("admin_password", password).apply()
                        sendBroadcast(Intent("com.mdm.launcher.ADMIN_PASSWORD_CHANGED").apply { putExtra("password", password) })
                    }
                }
                "update_app" -> {
                    val data = jsonObject["data"] as? Map<*, *>
                    val apkUrl = data?.get("apk_url") as? String
                    val version = data?.get("version") as? String
                    
                    if (!apkUrl.isNullOrEmpty()) {
                        Log.d(TAG, "📥 Comando de atualização recebido: $apkUrl (versão: ${version ?: "N/A"})")
                        serviceScope.launch {
                            com.mdm.launcher.utils.ApkInstaller.installApkFromUrl(
                                context = this@WebSocketService,
                                apkUrl = apkUrl,
                                version = version,
                                onProgress = { progress ->
                                    // Opcional: enviar progresso ao servidor
                                    Log.d(TAG, "Progresso da atualização: $progress%")
                                },
                                onComplete = { success, error ->
                                    if (success) {
                                        Log.d(TAG, "✅ Atualização concluída com sucesso")
                                        // Opcional: enviar confirmação ao servidor
                                        webSocketClient?.sendMessage(gson.toJson(mapOf(
                                            "type" to "update_app_complete",
                                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                                            "success" to true,
                                            "timestamp" to System.currentTimeMillis()
                                        )))
                                    } else {
                                        Log.e(TAG, "❌ Erro na atualização: $error")
                                        // Opcional: enviar erro ao servidor
                                        webSocketClient?.sendMessage(gson.toJson(mapOf(
                                            "type" to "update_app_error",
                                            "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this@WebSocketService),
                                            "error" to (error ?: "Erro desconhecido"),
                                            "timestamp" to System.currentTimeMillis()
                                        )))
                                    }
                                }
                            )
                        }
                    } else {
                        Log.e(TAG, "❌ Comando de atualização recebido sem URL do APK")
                    }
                }
                "support_message_received" -> showBackgroundNotification("Mensagem Enviada", "Sua mensagem foi recebida pelo servidor!")
                "support_message_error" -> showBackgroundNotification("Erro", "Não foi possível enviar a mensagem")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem", e)
        }
    }
    
    private fun sendDeviceStatus() {
        serviceScope.launch {
            try {
                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@WebSocketService)
                webSocketClient?.sendDeviceStatus(deviceInfo)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar status", e)
            }
        }
    }
    
    private fun sendDeviceStatusWithRealData() {
        serviceScope.launch {
            try {
                val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                val deviceName = prefs.getString("custom_device_name", "")?.takeIf { it.isNotEmpty() } ?: "${Build.MANUFACTURER} ${Build.MODEL}"
                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@WebSocketService, customName = deviceName)
                webSocketClient?.sendDeviceStatus(deviceInfo)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar dados reais", e)
            }
        }
    }
    
    private fun updateNotification(isConnected: Boolean) {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM Launcher")
            .setContentText(if (isConnected) "Conectado ao servidor" else "Desconectado do servidor")
            .setSmallIcon(R.drawable.ic_service_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, notification)
    }
    
    private fun showBackgroundNotification(title: String, body: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "mdm_notifications"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "MDM Launcher Notifications", NotificationManager.IMPORTANCE_HIGH)
            notificationManager.createNotificationChannel(channel)
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("mark_message_as_read", true)
            putExtra("show_message_modal", true)
        }
        val pendingIntent = PendingIntent.getActivity(this, System.currentTimeMillis().toInt(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.ic_service_notification)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(Notification.PRIORITY_HIGH)
            .build()
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
    
    private var lastReconnectingTime = 0L
    private fun startHealthCheck() {
        healthCheckJob?.cancel()
        healthCheckJob = serviceScope.launch {
            while (isActive && isServiceRunning) {
                delay(60000L)
                val isConnected = webSocketClient?.isConnected() ?: false
                if (!isConnected) forceReconnect()
            }
        }
    }
    
    private fun startNetworkMonitoring() {
        if (networkMonitor != null) return
        networkMonitor = NetworkMonitor(this).apply {
            startMonitoring { isConnected ->
                if (isConnected && webSocketClient?.isConnected() == false) {
                    serviceScope.launch { delay(2000); webSocketClient?.onNetworkChanged() }
                }
            }
        }
    }
    
    private fun handleNetworkChange() = webSocketClient?.onNetworkChanged()
    
    private fun forceReconnect() {
        wakeLock?.acquire(30000)
        serviceScope.launch {
            try {
                webSocketClient?.forceReconnect()
            } finally {
                if (wakeLock?.isHeld == true) wakeLock?.release()
            }
        }
    }
}
