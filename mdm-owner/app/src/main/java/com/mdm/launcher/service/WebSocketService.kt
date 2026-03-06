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
import com.mdm.launcher.UpdateProgressActivity
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.network.WebSocketClient
import com.mdm.launcher.utils.ConnectionStateManager
import com.mdm.launcher.utils.DeviceIdManager
import com.mdm.launcher.utils.DeviceInfoCollector
import com.mdm.launcher.utils.MessageManager
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
                    Log.d(TAG, "Broadcast de mudança de rede recebido")
                    handleNetworkChange()
                }
                "com.mdm.launcher.FORCE_RECONNECT" -> {
                    Log.d(TAG, "Broadcast de reconexão forçada recebido")
                    forceReconnect()
                }
                "com.mdm.launcher.ALARM_STARTED" -> {
                    Log.d(TAG, "Alarme iniciou no dispositivo - enviando confirmação")
                    webSocketClient?.sendMessage(com.google.gson.Gson().toJson(mapOf(
                        "type" to "alarm_confirmed",
                        "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                        "success" to true,
                        "timestamp" to System.currentTimeMillis()
                    )))
                }
            }
        }
    }

    /** ACTION_SCREEN_ON só pode ser recebido por receiver dinâmico. Ao ligar tela, abre app kiosk. */
    private var screenOnReceiver: BroadcastReceiver? = null

    companion object {
        private const val TAG = "WebSocketService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "websocket_service_channel"
        private const val CHANNEL_NAME = "MDM Center Service"
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
            addAction("com.mdm.launcher.ALARM_STARTED")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, filter)
        }

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MDMLauncher::WebSocketWakeLock")
        ConnectionStateManager.scheduleHealthChecks(this)
        registerKioskScreenReceiver()
    }

    private fun registerKioskScreenReceiver() {
        // Desabilitado: WMS e outros apps iniciam apenas quando o usuário clicar.
        // Tela fixa é o MDM launcher; não há auto-abertura ao ligar a tela.
        screenOnReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                // Não abrir app automaticamente - usuário clica para abrir WMS
            }
        }
        val filter = IntentFilter(Intent.ACTION_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenOnReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(screenOnReceiver, filter)
        }
        Log.d(TAG, "Receiver de tela registrado (sem auto-abertura de apps)")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        isServiceRunning = true

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
        try {
            unregisterReceiver(commandReceiver)
        } catch (e: Exception) {}
        try {
            screenOnReceiver?.let { unregisterReceiver(it) }
        } catch (e: Exception) {}
        if (wakeLock?.isHeld == true) wakeLock?.release()
        webSocketClient?.disconnect()
        serviceScope.cancel()
        super.onDestroy()
    }

    fun isConnected(): Boolean = webSocketClient?.isConnected() == true

    fun sendMessage(message: String) {
        webSocketClient?.sendMessage(message)
    }

    fun sendDeviceStatus(deviceInfo: DeviceInfo? = null) {
        if (!isConnected()) return
        val data = deviceInfo ?: return
        webSocketClient?.sendDeviceStatus(data)
    }

    fun setScreenActive(active: Boolean) {
        isScreenActive = active
    }

    fun onNetworkChanged() {
        webSocketClient?.onNetworkChanged()
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
            .setContentTitle("MDM Center")
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
            val deviceId = DeviceIdManager.getDeviceId(this)

            Log.d(TAG, "Servidor descoberto: $serverUrl")

            webSocketClient = WebSocketClient.getInstance(
                serverUrl = serverUrl,
                deviceId = deviceId,
                onMessage = { processBackgroundMessage(it) },
                onConnectionChange = { connected ->
                    updateNotification(connected)
                    ConnectionStateManager.saveConnectionState(this@WebSocketService, connected)
                    if (connected) {
                        sendDeviceStatusWithRealData()
                        // Retry após 2s (caso o primeiro envio falhe ou se perca)
                        serviceScope.launch {
                            kotlinx.coroutines.delay(2000L)
                            if (webSocketClient?.isConnected() == true) {
                                sendDeviceStatusWithRealData()
                            }
                        }
                        // Aplicar políticas ao conectar (desbloqueio, Settings, Quick Settings)
                        com.mdm.launcher.utils.DevicePolicyHelper.applyDevicePolicies(this@WebSocketService)
                        sendBroadcast(Intent("com.mdm.launcher.APPLY_DEVICE_POLICIES").setPackage(packageName))
                    }
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
                    val title = dataMap["title"] as? String ?: "MDM Center"
                    val body = dataMap["body"] as? String ?: "Nova notificação"
                    MessageManager.saveMessage(this, if (title != "MDM Center") "$title\n$body" else body)
                    showBackgroundNotification(title, body)
                    webSocketClient?.sendMessage(gson.toJson(mapOf("type" to "notification_received", "deviceId" to DeviceIdManager.getDeviceId(this), "timestamp" to System.currentTimeMillis())))
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
                        Log.d(TAG, "Comando de atualização recebido: $apkUrl (versão: ${version ?: "N/A"})")
                        val updateIntent = Intent(this@WebSocketService, UpdateProgressActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(updateIntent)
                        serviceScope.launch {
                            kotlinx.coroutines.delay(800)
                            sendBroadcast(Intent(UpdateProgressActivity.ACTION_UPDATE_PROGRESS).apply {
                                setPackage(packageName)
                                putExtra(UpdateProgressActivity.EXTRA_PROGRESS, 0)
                                putExtra(UpdateProgressActivity.EXTRA_STATUS, "Preparando...")
                            })
                            com.mdm.launcher.utils.ApkInstaller.installApkFromUrl(
                                context = this@WebSocketService,
                                apkUrl = apkUrl,
                                version = version,
                                onProgress = { progress ->
                                    Log.d(TAG, "Progresso da atualização: $progress%")
                                    val status = when {
                                        progress < 20 -> "Preparando..."
                                        progress < 80 -> "Baixando atualização..."
                                        progress < 95 -> "Instalando..."
                                        else -> "Finalizando..."
                                    }
                                    sendBroadcast(Intent(UpdateProgressActivity.ACTION_UPDATE_PROGRESS).apply {
                                        setPackage(packageName)
                                        putExtra(UpdateProgressActivity.EXTRA_PROGRESS, progress)
                                        putExtra(UpdateProgressActivity.EXTRA_STATUS, status)
                                    })
                                },
                                onComplete = { success, error ->
                                    sendBroadcast(Intent(UpdateProgressActivity.ACTION_UPDATE_DONE).apply {
                                        setPackage(packageName)
                                    })
                                    if (success) {
                                        Log.d(TAG, "Atualização concluída com sucesso")
                                        webSocketClient?.sendMessage(gson.toJson(mapOf(
                                            "type" to "update_app_complete",
                                            "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                            "success" to true,
                                            "timestamp" to System.currentTimeMillis()
                                        )))
                                    } else {
                                        Log.e(TAG, "Erro na atualização: $error")
                                        webSocketClient?.sendMessage(gson.toJson(mapOf(
                                            "type" to "update_app_error",
                                            "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                            "error" to (error ?: "Erro desconhecido"),
                                            "timestamp" to System.currentTimeMillis()
                                        )))
                                    }
                                }
                            )
                        }
                    } else {
                        Log.e(TAG, "Comando de atualização recebido sem URL do APK")
                    }
                }
                "support_message_received" -> { /* Silencioso - usuário não deve saber que a mensagem foi recebida/lida */ }
                "support_message_error" -> showBackgroundNotification("Erro", "Não foi possível enviar a mensagem")
                "apply_device_policies" -> {
                    Log.d(TAG, "Aplicando políticas de dispositivo (bloqueio, Settings, Quick Settings)")
                    com.mdm.launcher.utils.DevicePolicyHelper.applyDevicePolicies(this@WebSocketService)
                    sendBroadcast(Intent("com.mdm.launcher.APPLY_DEVICE_POLICIES").setPackage(packageName))
                }
                "start_alarm" -> {
                    Log.d(TAG, "Comando start_alarm recebido - iniciando alarme")
                    val intent = Intent(this, com.mdm.launcher.service.AlarmService::class.java).apply {
                        action = "START"
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(intent)
                    } else {
                        startService(intent)
                    }
                    // alarm_confirmed será enviado pelo AlarmService quando o som iniciar
                }
                "stop_alarm" -> {
                    Log.d(TAG, "Comando stop_alarm recebido - parando alarme")
                    val intent = Intent(this, com.mdm.launcher.service.AlarmService::class.java).apply {
                        action = "STOP"
                    }
                    startService(intent)
                    webSocketClient?.sendMessage(gson.toJson(mapOf(
                        "type" to "alarm_stopped",
                        "deviceId" to DeviceIdManager.getDeviceId(this),
                        "timestamp" to System.currentTimeMillis()
                    )))
                }
                "reboot_device" -> {
                    Log.d(TAG, "Comando reboot_device recebido - reiniciando dispositivo")
                    serviceScope.launch {
                        try {
                            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val admin = android.content.ComponentName(this@WebSocketService, com.mdm.launcher.DeviceAdminReceiver::class.java)
                            if (dpm.isDeviceOwnerApp(packageName)) {
                                showBackgroundNotification("MDM Center", "Dispositivo será reiniciado em 3 segundos...")
                                kotlinx.coroutines.delay(3000)
                                try {
                                    webSocketClient?.sendMessage(gson.toJson(mapOf(
                                        "type" to "reboot_device_confirmed",
                                        "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                        "success" to true,
                                        "timestamp" to System.currentTimeMillis()
                                    )))
                                    // Marcar antes de reboot para ShutdownReceiver não causar boot loop
                                    getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                                        .edit()
                                        .putLong(com.mdm.launcher.receivers.ShutdownReceiver.PREF_LAST_REBOOT_INITIATED, System.currentTimeMillis())
                                        .apply()
                                    dpm.reboot(admin)
                                    Log.d(TAG, "Comando de reinicialização executado")
                                } catch (e: Exception) {
                                    Log.e(TAG, "Erro ao reiniciar", e)
                                    webSocketClient?.sendMessage(gson.toJson(mapOf(
                                        "type" to "reboot_device_confirmed",
                                        "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                        "success" to false,
                                        "reason" to (e.message ?: "Erro desconhecido"),
                                        "timestamp" to System.currentTimeMillis()
                                    )))
                                }
                            } else {
                                Log.w(TAG, "Não é Device Owner - não pode reiniciar")
                                webSocketClient?.sendMessage(gson.toJson(mapOf(
                                    "type" to "reboot_device_confirmed",
                                    "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                    "success" to false,
                                    "reason" to "Não é Device Owner. O app precisa ser Device Owner para reiniciar.",
                                    "timestamp" to System.currentTimeMillis()
                                )))
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Erro ao processar reboot", e)
                            webSocketClient?.sendMessage(gson.toJson(mapOf(
                                "type" to "reboot_device_confirmed",
                                "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                "success" to false,
                                "reason" to (e.message ?: "Erro desconhecido"),
                                "timestamp" to System.currentTimeMillis()
                            )))
                        }
                    }
                }
                "lock_device" -> {
                    Log.d(TAG, "Comando lock_device recebido - bloqueando dispositivo (tela preta com cadeado)")
                    try {
                        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            // Desabilitar bloqueio padrão do Android - só usamos a tela MDM
                            com.mdm.launcher.utils.DevicePolicyHelper.disableLockScreen(this)
                            // OBRIGATÓRIO: setLockTaskPackages antes de startLockTask na LockScreenActivity
                            val adminComponent = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
                            try {
                                dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
                                Log.d(TAG, "Lock task packages definidos para tela de bloqueio")
                            } catch (e: Exception) {
                                Log.e(TAG, "setLockTaskPackages falhou: ${e.message}")
                            }
                            val lockIntent = Intent(this, com.mdm.launcher.LockScreenActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_HISTORY or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
                            }
                            startActivity(lockIntent)
                            // NÃO usa lockNow() - LockScreenActivity usa Lock Task Mode e fica até unlock_device
                            Log.d(TAG, "Tela de bloqueio iniciada - permanece até desbloqueio pelo painel MDM")
                            webSocketClient?.sendMessage(com.google.gson.Gson().toJson(mapOf(
                                "type" to "lock_device_confirmed",
                                "deviceId" to DeviceIdManager.getDeviceId(this),
                                "success" to true,
                                "timestamp" to System.currentTimeMillis()
                            )))
                        } else {
                            Log.w(TAG, "Não é Device Owner - não pode bloquear")
                            webSocketClient?.sendMessage(com.google.gson.Gson().toJson(mapOf(
                                "type" to "lock_device_confirmed",
                                "deviceId" to DeviceIdManager.getDeviceId(this),
                                "success" to false,
                                "reason" to "Não é Device Owner",
                                "timestamp" to System.currentTimeMillis()
                            )))
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Erro ao bloquear dispositivo", e)
                        webSocketClient?.sendMessage(com.google.gson.Gson().toJson(mapOf(
                            "type" to "lock_device_confirmed",
                            "deviceId" to DeviceIdManager.getDeviceId(this),
                            "success" to false,
                            "reason" to (e.message ?: "Erro desconhecido"),
                            "timestamp" to System.currentTimeMillis()
                        )))
                    }
                }
                "unlock_device" -> {
                    Log.d(TAG, "Comando unlock_device recebido - desbloqueando dispositivo")
                    val unlockIntent = Intent(com.mdm.launcher.LockScreenActivity.ACTION_UNLOCK).apply {
                        setPackage(packageName)
                    }
                    sendBroadcast(unlockIntent)
                    webSocketClient?.sendMessage(gson.toJson(mapOf(
                        "type" to "unlock_device_confirmed",
                        "deviceId" to DeviceIdManager.getDeviceId(this),
                        "success" to true,
                        "timestamp" to System.currentTimeMillis()
                    )))
                    Log.d(TAG, "Comando de desbloqueio enviado para LockScreenActivity")
                }
                else -> {
                    // Encaminhar comandos não tratados para MainActivity (lock_device, reboot_device, etc)
                    val intent = Intent("com.mdm.launcher.UEM_COMMAND")
                    intent.setPackage(packageName)
                    intent.putExtra("message", message)
                    sendBroadcast(intent)
                }
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
            .setContentTitle("MDM Center")
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
            val channel = NotificationChannel(channelId, "MDM Center Notifications", NotificationManager.IMPORTANCE_HIGH)
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
                    serviceScope.launch {
                        delay(2000)
                        webSocketClient?.onNetworkChanged()
                    }
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
