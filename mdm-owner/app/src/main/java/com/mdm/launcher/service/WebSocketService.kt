package com.mdm.launcher.service

import android.app.*
import android.content.*
import android.database.ContentObserver
import android.media.AudioManager
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
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
                "com.mdm.launcher.WMS_ERROR" -> {
                    val errorText = intent.getStringExtra("error_text") ?: "Erro no WMS"
                    val deviceId = DeviceIdManager.getDeviceId(this@WebSocketService)
                    val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                    val deviceName = prefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
                    Log.d(TAG, "Erro WMS recebido, enviando mensagem de suporte: $errorText")
                    webSocketClient?.sendMessage(com.google.gson.Gson().toJson(mapOf(
                        "type" to "support_message",
                        "deviceId" to deviceId,
                        "deviceName" to deviceName,
                        "message" to "⚠️ Erro WMS: $errorText",
                        "androidVersion" to android.os.Build.VERSION.RELEASE,
                        "model" to android.os.Build.MODEL,
                        "timestamp" to System.currentTimeMillis()
                    )))
                }
            }
        }
    }

    /** ACTION_SCREEN_ON só pode ser recebido por receiver dinâmico. Ao ligar tela, abre app kiosk. */
    private var screenOnReceiver: BroadcastReceiver? = null

    /** ACTION_SCREEN_OFF: não faz nada (evita sirene/cadeado ao power/timeout) */
    private var screenOffReceiver: BroadcastReceiver? = null
    private var lastScreenOffTime = 0L
    private val SCREEN_OFF_IGNORE_VOLUME_MS = 15000L  // 15s - evita sirene ao bloquear por timeout ou 1 click power

    /** Regra: volume (+ ou -) em qualquer app = inicia sirene de alerta */
    private var volumeContentObserver: ContentObserver? = null

    private var lastVolumeMusic = -1
    private var lastVolumeRing = -1
    private var lastVolumeAlarm = -1
    private var lastAlarmSirenFromVolume = 0L
    private val ALARM_SIREN_COOLDOWN_MS = 2000L

    /** Overlay para capturar teclas power/volume quando outro app está em foco (ex: WMS) */
    private var keyCaptureOverlay: View? = null

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
            addAction("com.mdm.launcher.WMS_ERROR")
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
        registerVolumeObserver()
        // BluetoothPairingReceiver registrado no manifest - sempre ativo
        setupKeyCaptureOverlay()
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

        registerScreenOffReceiver()
    }

    /** Power/timeout: não faz nada - evita sirene e cadeado ao bloquear normalmente */
    private fun registerScreenOffReceiver() {
        screenOffReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != Intent.ACTION_SCREEN_OFF) return
                lastScreenOffTime = System.currentTimeMillis()
                // Não iniciar sirene nem mostrar cadeado - deixa o Android tratar normalmente
            }
        }
        val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenOffReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(screenOffReceiver, filter)
        }
        Log.d(TAG, "Receiver SCREEN_OFF registrado (sem sirene/cadeado ao desligar tela)")
    }

    /** Regra: ao pressionar volume (+ ou -) em qualquer app = inicia sirene de alerta */
    private fun registerVolumeObserver() {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            lastVolumeMusic = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
            lastVolumeRing = audioManager.getStreamVolume(AudioManager.STREAM_RING)
            lastVolumeAlarm = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)

            volumeContentObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean, uri: Uri?) {
                    val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                    val curMusic = am.getStreamVolume(AudioManager.STREAM_MUSIC)
                    val curRing = am.getStreamVolume(AudioManager.STREAM_RING)
                    val curAlarm = am.getStreamVolume(AudioManager.STREAM_ALARM)
                    val changed = (curMusic != lastVolumeMusic || curRing != lastVolumeRing || curAlarm != lastVolumeAlarm)
                    if (changed) {
                        lastVolumeMusic = curMusic
                        lastVolumeRing = curRing
                        lastVolumeAlarm = curAlarm
                        // Sem sirene - volume apenas atualiza estado
                    }
                }
            }
            contentResolver.registerContentObserver(Settings.System.CONTENT_URI, true, volumeContentObserver!!)
            Log.d(TAG, "ContentObserver de volume registrado - sirene ao pressionar volume")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao registrar observer de volume: ${e.message}")
        }
    }

    private fun isScreenOn(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            pm.isInteractive
        } else {
            @Suppress("DEPRECATION")
            pm.isScreenOn
        }
    }

    /** Overlay invisível para capturar power/volume quando WMS ou outro app está em foco */
    private fun setupKeyCaptureOverlay() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                !android.provider.Settings.canDrawOverlays(this)) {
                Log.w(TAG, "Sem permissão de overlay - teclas power/volume só funcionam na tela do MDM")
                return
            }
            val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val overlay = object : View(this) {
                override fun dispatchKeyEvent(event: KeyEvent?): Boolean {
                    if (event == null) return super.dispatchKeyEvent(event)
                    if (event.action == KeyEvent.ACTION_DOWN) {
                        when (event.keyCode) {
                            KeyEvent.KEYCODE_POWER -> {
                                // Power: deixa o sistema tratar (sem sirene/cadeado)
                                return false
                            }
                            KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_VOLUME_MUTE -> {
                                // Sem sirene - apenas tela de cadeado
                                com.mdm.launcher.utils.DevicePolicyHelper.showLockScreenOnly(this@WebSocketService)
                                return true
                            }
                            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_HOME, KeyEvent.KEYCODE_MENU,
                            KeyEvent.KEYCODE_CAMERA, KeyEvent.KEYCODE_APP_SWITCH, KeyEvent.KEYCODE_ESCAPE -> {
                                com.mdm.launcher.utils.DevicePolicyHelper.showLockScreenOnly(this@WebSocketService)
                                return true
                            }
                        }
                    }
                    return super.dispatchKeyEvent(event)
                }
            }.apply {
                isFocusable = true
                isFocusableInTouchMode = true
            }
            val params = WindowManager.LayoutParams().apply {
                width = WindowManager.LayoutParams.MATCH_PARENT
                height = WindowManager.LayoutParams.MATCH_PARENT
                type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }
                flags = WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                format = android.graphics.PixelFormat.TRANSPARENT
            }
            wm.addView(overlay, params)
            overlay.requestFocus()
            keyCaptureOverlay = overlay
            Log.d(TAG, "Overlay: power=deixa sistema tratar, volume=sirene+cadeado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao criar overlay de teclas: ${e.message}")
        }
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
        try {
            screenOffReceiver?.let { unregisterReceiver(it) }
        } catch (e: Exception) {}
        try {
            volumeContentObserver?.let { contentResolver.unregisterContentObserver(it) }
        } catch (e: Exception) {}
        try {
            keyCaptureOverlay?.let {
                (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(it)
            }
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
                "install_app" -> {
                    val packageName = jsonObject["packageName"] as? String
                    if (!packageName.isNullOrEmpty()) {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("market://details?id=$packageName"))
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            startActivity(intent)
                        } catch (e: Exception) {
                            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://play.google.com/store/apps/details?id=$packageName"))
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            startActivity(intent)
                        }
                    }
                }
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
                        val localApkUrl = com.mdm.launcher.utils.ServerDiscovery.getApkUrlFromConnection(this@WebSocketService)
                        val (primaryUrl, fallbackUrls) = if (localApkUrl != null) {
                            Log.d(TAG, "Usando URL do servidor conectado primeiro: $localApkUrl")
                            localApkUrl to listOf(apkUrl)
                        } else {
                            apkUrl to emptyList<String>()
                        }
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
                                apkUrl = primaryUrl,
                                version = version,
                                fallbackUrls = fallbackUrls,
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
                                    // Enviar progresso para o painel web
                                    webSocketClient?.sendMessage(gson.toJson(mapOf(
                                        "type" to "update_app_progress",
                                        "deviceId" to DeviceIdManager.getDeviceId(this@WebSocketService),
                                        "progress" to progress,
                                        "status" to status,
                                        "timestamp" to System.currentTimeMillis()
                                    )))
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
                "server_config" -> {
                    // Servidor enviou sua URL pública — salvar para reconexão em qualquer rede
                    val data = jsonObject["data"] as? Map<*, *>
                    val publicWsUrl = data?.get("publicWsUrl") as? String
                    if (!publicWsUrl.isNullOrEmpty()) {
                        getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                            .edit()
                            .putString("public_server_url", publicWsUrl)
                            .apply()
                        Log.d(TAG, "URL pública do servidor salva: $publicWsUrl")
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
                    // Sirene removida - comando ignorado
                    Log.d(TAG, "Comando start_alarm recebido - sirene desabilitada")
                }
                "stop_alarm" -> {
                    // Sirene removida - comando ignorado
                    Log.d(TAG, "Comando stop_alarm recebido - sirene desabilitada")
                }
                "wake_device" -> {
                    Log.d(TAG, "Comando wake_device recebido - acordando tela")
                    try {
                        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                        @Suppress("DEPRECATION")
                        val wl = pm.newWakeLock(
                            PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                            "mdm:wakeup"
                        )
                        wl.acquire(5000)
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            try { wl.release() } catch (_: Exception) {}
                        }, 5000)
                        webSocketClient?.sendMessage(gson.toJson(mapOf(
                            "type" to "wake_device_confirmed",
                            "deviceId" to DeviceIdManager.getDeviceId(this),
                            "success" to true,
                            "timestamp" to System.currentTimeMillis()
                        )))
                    } catch (e: Exception) {
                        Log.e(TAG, "Erro ao acordar tela: ${e.message}")
                        webSocketClient?.sendMessage(gson.toJson(mapOf(
                            "type" to "wake_device_confirmed",
                            "deviceId" to DeviceIdManager.getDeviceId(this),
                            "success" to false,
                            "reason" to (e.message ?: "Erro desconhecido"),
                            "timestamp" to System.currentTimeMillis()
                        )))
                    }
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
                            // Bloquear tudo na tela de bloqueio (sem status bar, sem notificações)
                            com.mdm.launcher.utils.DevicePolicyHelper.disableLockTaskFeatures(this)
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
                "set_device_restrictions" -> {
                    Log.d(TAG, "Comando set_device_restrictions recebido")
                    try {
                        val data = jsonObject["data"] as? Map<*, *>
                        if (data != null) {
                            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val adminComponent = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
                            if (dpm.isDeviceOwnerApp(packageName)) {
                                // WiFi
                                if (data["wifiDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                                }
                                // Bluetooth
                                if (data["bluetoothDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
                                }
                                // Câmera
                                dpm.setCameraDisabled(adminComponent, data["cameraDisabled"] == true)
                                // Screenshots
                                if (data["screenshotDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_SCREEN_TIMEOUT)
                                }
                                dpm.setScreenCaptureDisabled(adminComponent, data["screenshotDisabled"] == true)
                                // Status bar
                                dpm.setStatusBarDisabled(adminComponent, data["statusBarDisabled"] == true)
                                // Instalar apps
                                if (data["installAppsDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_INSTALL_APPS)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_INSTALL_APPS)
                                }
                                // Desinstalar apps
                                if (data["uninstallAppsDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_UNINSTALL_APPS)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_UNINSTALL_APPS)
                                }
                                // Factory reset
                                if (data["factoryResetDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_FACTORY_RESET)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_FACTORY_RESET)
                                }
                                // USB
                                if (data["usbDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_USB_FILE_TRANSFER)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_USB_FILE_TRANSFER)
                                }
                                // Hotspot/tethering
                                if (data["hotspotDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_TETHERING)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_TETHERING)
                                }
                                // NFC
                                if (data["nfcDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_OUTGOING_BEAM)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_OUTGOING_BEAM)
                                }
                                // Localização
                                if (data["locationDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_LOCATION)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_LOCATION)
                                }
                                // Hora automática
                                if (data["autoTimeRequired"] == true) {
                                    dpm.setAutoTimeRequired(adminComponent, true)
                                } else {
                                    dpm.setAutoTimeRequired(adminComponent, false)
                                }
                                // Configurações (Settings)
                                if (data["settingsDisabled"] == true) {
                                    for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                                        try { dpm.setApplicationHidden(adminComponent, pkg, true) } catch (_: Exception) {}
                                    }
                                } else {
                                    for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                                        try { dpm.setApplicationHidden(adminComponent, pkg, false) } catch (_: Exception) {}
                                    }
                                }
                                // Opções de desenvolvedor
                                if (data["developerOptionsDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_DEBUGGING_FEATURES)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_DEBUGGING_FEATURES)
                                }
                                // Bluetooth pairing (impedir parear novos dispositivos)
                                if (data["bluetoothPairingDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_BLUETOOTH)
                                } else if (data["bluetoothDisabled"] != true) {
                                    // Só libera se bluetooth não estiver totalmente bloqueado
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_BLUETOOTH)
                                }
                                // Bloquear adicionar contas (Google, etc)
                                if (data["addAccountDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS)
                                }
                                // Bloquear compartilhamento de dados (share/send)
                                if (data["shareDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE)
                                }
                                // Bloquear montagem de mídia externa (SD card etc)
                                if (data["externalStorageDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
                                }
                                // Bloquear ligar/desligar modo avião
                                if (data["airplaneModeDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_AIRPLANE_MODE)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_AIRPLANE_MODE)
                                }
                                // Bloquear ligações de saída
                                if (data["outgoingCallsDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_OUTGOING_CALLS)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_OUTGOING_CALLS)
                                }
                                // Bloquear SMS
                                if (data["smsDisabled"] == true) {
                                    dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_SMS)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_SMS)
                                }
                                // Lock Screen (trava remota)
                                if (data["lockScreen"] == true) {
                                    com.mdm.launcher.utils.DevicePolicyHelper.showLockScreenOnly(this)
                                }
                                // Fixar app (impedir sair do app atual - kiosk)
                                if (data["kioskMode"] == true) {
                                    val mainIntent = Intent(this, com.mdm.launcher.MainActivity::class.java)
                                    mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    startActivity(mainIntent)
                                    // O startLockTask será chamado pelo MainActivity
                                }

                                Log.d(TAG, "Restrições aplicadas com sucesso")
                                webSocketClient?.sendMessage(gson.toJson(mapOf(
                                    "type" to "restrictions_applied",
                                    "deviceId" to DeviceIdManager.getDeviceId(this),
                                    "success" to true,
                                    "timestamp" to System.currentTimeMillis()
                                )))
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Erro ao aplicar restrições: ${e.message}", e)
                    }
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
        val channelId = "mdm_web_notifications"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Mensagens do Painel Web", NotificationManager.IMPORTANCE_HIGH)
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
        val id = System.currentTimeMillis().toInt()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            notificationManager.notify(MdmNotificationListenerService.WEB_NOTIFICATION_TAG, id, notification)
        } else {
            notificationManager.notify(id, notification)
        }
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
