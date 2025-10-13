package com.mdm.launcher

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.PowerManager
import android.text.InputType
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import java.lang.Runtime
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.View.MeasureSpec
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.ExclusionStrategy
import com.google.gson.FieldAttributes
import java.lang.reflect.Modifier
import com.google.gson.reflect.TypeToken
import com.mdm.launcher.data.AppInfo
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.network.WebSocketClient
import com.mdm.launcher.service.WebSocketService
import com.mdm.launcher.service.LocationService
import com.mdm.launcher.ui.AppAdapter
import com.mdm.launcher.utils.DeviceInfoCollector
import com.mdm.launcher.utils.LocationHistoryManager
import com.mdm.launcher.utils.GeofenceManager
import com.mdm.launcher.utils.GeofenceEvent
import com.mdm.launcher.utils.PermissionManager
import com.mdm.launcher.utils.NetworkMonitor
import com.mdm.launcher.utils.ServerDiscovery
import kotlinx.coroutines.*

// Enum para tipos de permissão
enum class PermissionType {
    DEVICE_ADMIN,
    DEFAULT_LAUNCHER,
    USAGE_STATS,
    LOCATION,
    NOTIFICATIONS
}

// Classe para item de permissão
data class PermissionItem(
    val type: PermissionType,
    val title: String,
    val description: String,
    val priority: Int
)

class MainActivity : AppCompatActivity() {
    
    private lateinit var appsRecyclerView: RecyclerView
    private lateinit var emptyLayout: View
    private lateinit var loadingProgress: ProgressBar
    private lateinit var connectionStatusText: TextView
    private lateinit var configButton: com.google.android.material.floatingactionbutton.FloatingActionButton
    
    private var appAdapter: AppAdapter? = null
    private var webSocketClient: WebSocketClient? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val handler = Handler(Looper.getMainLooper())
    private var periodicSyncRunnable: Runnable? = null
    private val gson = GsonBuilder()
        .excludeFieldsWithModifiers(Modifier.TRANSIENT)
        .setExclusionStrategies(object : ExclusionStrategy {
            override fun shouldSkipField(f: FieldAttributes): Boolean {
                return f.declaredClass == android.graphics.drawable.Drawable::class.java
            }
            override fun shouldSkipClass(clazz: Class<*>): Boolean = false
        })
        .create()
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var permissionManager: PermissionManager
    
    private var allowedApps: List<String> = emptyList()
    private var installedApps: List<AppInfo> = emptyList()
    private var lastAppUpdateTime: Long = 0
    private val APP_CACHE_DURATION = 5 * 60 * 1000L // 5 minutos
    private var isLoadingApps = false
    private var isActivityDestroyed = false
    private var lastResumeTime = 0L
    private var lastPauseTime = 0L
    private var pauseResumeCount = 0
    private var permissionRequestCount = 0
    private var lastPermissionRequestTime = 0L
    private var customDeviceName: String = ""
    private var adminPassword: String = ""
    
    // Controle de interação do usuário
    private var lastInteractionTime = System.currentTimeMillis()
    
    // Debug: Contador para remover Device Owner (10 cliques rápidos no botão config)
    private var configButtonClickCount = 0
    private var lastConfigButtonClickTime = 0L
    
    // Serviço WebSocket em background
    private var webSocketService: WebSocketService? = null
    
    // Controle de estado da tela para conexão persistente
    private var isScreenLocked = false
    private var lastScreenStateChange = 0L
    private var screenStateReceiver: BroadcastReceiver? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var isServiceBound = false
    
    // Localização
    private var locationManager: LocationManager? = null
    private var lastKnownLocation: Location? = null
    private var isLocationTrackingEnabled = false
    private var locationListener: LocationListener? = null
    
    // Monitoramento de rede
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var isNetworkAvailable = false
    private var networkMonitor: NetworkMonitor? = null
    
    // Modal de mensagem
    private var messageModal: View? = null
    private var isMessageModalVisible = false
    private var lastNotificationMessage: String = ""
    private var lastNotificationTimestamp: Long = 0L
    private var hasShownPendingMessage = false
    
    // BroadcastReceiver para mensagens do Service
    private val serviceMessageReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                "com.mdm.launcher.UPDATE_APP_PERMISSIONS" -> {
                    val message = intent.getStringExtra("message")
                    if (message != null) {
                        Log.d(TAG, "📨 Mensagem de permissões recebida do Service via Broadcast")
                        handleWebSocketMessage(message)
                    }
                }
                "com.mdm.launcher.LOCATION_UPDATE" -> {
                    val locationData = intent.getStringExtra("location_data")
                    if (locationData != null) {
                        Log.d(TAG, "📍 Recebendo atualização de localização via broadcast")
                        sendLocationToServer(locationData)
                    }
                }
                "com.mdm.launcher.SET_KIOSK_MODE" -> {
                    val message = intent.getStringExtra("message")
                    if (message != null) {
                        Log.d(TAG, "📱 SET_KIOSK_MODE recebido via Broadcast")
                        handleWebSocketMessage(message)
                    }
                }
                "com.mdm.launcher.UEM_COMMAND" -> {
                    val message = intent.getStringExtra("message")
                    if (message != null) {
                        Log.d(TAG, "📱 UEM_COMMAND recebido via Broadcast")
                        handleWebSocketMessage(message)
                    }
                }
            }
        }
    }
    
    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_CODE_ENABLE_ADMIN = 1001
        private const val REQUEST_CODE_USAGE_STATS = 1002
        private const val REQUEST_CODE_LOCATION = 1003
        private const val REQUEST_CODE_NOTIFICATIONS = 1004
        private const val LOCATION_UPDATE_INTERVAL = 10000L // 10 segundos - mais frequente para melhor precisão
        private const val LOCATION_UPDATE_DISTANCE = 1f // 1 metro - máxima precisão
    }
    
    // ServiceConnection para o WebSocketService
    private val serviceConnection = object : android.content.ServiceConnection {
        override fun onServiceConnected(name: android.content.ComponentName?, service: android.os.IBinder?) {
            Log.d(TAG, "WebSocketService conectado")
            val binder = service as WebSocketService.LocalBinder
            webSocketService = binder.getService()
            isServiceBound = true
            
            // Verificar se o serviço está conectado
            if (webSocketService?.isConnected() == true) {
                Log.d(TAG, "WebSocket já conectado via serviço")
            }
        }
        
        override fun onServiceDisconnected(name: android.content.ComponentName?) {
            Log.d(TAG, "WebSocketService desconectado")
            webSocketService = null
            isServiceBound = false
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Garantir que esta é a única instância da MainActivity
        if (!isTaskRoot) {
            Log.d(TAG, "Activity não é root - finalizando instâncias extras")
            finish()
            return
        }
        
        // Inicializar PermissionManager
        permissionManager = PermissionManager(this)
        
        // Garantir que a barra de navegação seja visível usando API moderna
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.show(android.view.WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = 0
        }
        
        // Forçar exibição da barra de navegação após um delay
        window.decorView.post {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                window.insetsController?.show(android.view.WindowInsets.Type.navigationBars())
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = 0
            }
        }
        
        // Inicializar SharedPreferences para persistência
        sharedPreferences = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
        
        initViews()
        setupRecyclerView()
        setupConfigButton()
        setupMessageModal()
        checkAndRequestPermissions()
        setupNetworkMonitoring()
        initializeNetworkMonitor()
        
        // Registrar BroadcastReceiver para mensagens do Service
        try {
            val filter = IntentFilter().apply {
                addAction("com.mdm.launcher.UPDATE_APP_PERMISSIONS")
                addAction("com.mdm.launcher.LOCATION_UPDATE")
                addAction("com.mdm.launcher.SET_KIOSK_MODE")
                addAction("com.mdm.launcher.UEM_COMMAND")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(serviceMessageReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(serviceMessageReceiver, filter)
            }
            Log.d(TAG, "✅ BroadcastReceiver registrado para mensagens do Service")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao registrar BroadcastReceiver", e)
        }
        
        startWebSocketService()
        // setupWebSocketClient() - REMOVIDO: usar apenas WebSocketService para evitar conexões duplicadas
        startLocationService()
        
        // Configurar controle de tela para conexão persistente
        setupScreenStateMonitoring()
        
        // Carregar dados salvos
        loadSavedData()
        
        // Verificar se somos o launcher padrão
        checkDefaultLauncherStatus()
        
        // Verificar se deve mostrar modal de mensagem (vindo de notificação)
        handleNotificationIntent()
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        Log.d(TAG, "📨 onNewIntent() chamado - processando novo intent sem recriar Activity")
        setIntent(intent)
        handleNotificationIntent()
    }
    
    private fun handleNotificationIntent() {
        val intent = intent
        if (intent.getBooleanExtra("show_message_modal", false)) {
            val messageContent = intent.getStringExtra("message_content")
            if (!messageContent.isNullOrEmpty()) {
                Log.d(TAG, "Intent de notificação recebido, mostrando modal com mensagem: $messageContent")
                // Resetar flag para permitir exibição da nova mensagem
                hasShownPendingMessage = false
                isMessageModalVisible = false
                // Aguardar um pouco para garantir que a UI esteja pronta
                messageModal?.postDelayed({
                    showMessageModal(messageContent)
                }, 500)
            }
        }
    }
    
    private fun checkDefaultLauncherStatus() {
        try {
            val packageManager = packageManager
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
            }
            
            val resolveInfos = packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            val currentLauncher = if (resolveInfos.isNotEmpty()) {
                resolveInfos[0].activityInfo.packageName
            } else null
            
            Log.d(TAG, "Launcher padrão atual: $currentLauncher")
            Log.d(TAG, "Nosso package name: ${packageName}")
            
            if (currentLauncher != packageName) {
                Log.w(TAG, "MDM Launcher não é o launcher padrão! Atual: $currentLauncher")
                
                // Verificar se já mostramos a mensagem recentemente
                val prefs = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
                val lastWarningTime = prefs.getLong("last_launcher_warning", 0)
                val currentTime = System.currentTimeMillis()
                val warningCooldown = 5 * 60 * 1000L // 5 minutos
                
                if (currentTime - lastWarningTime > warningCooldown) {
                    // Tentar definir automaticamente como launcher padrão
                    if (isDeviceOwner()) {
                        try {
                            setAsDefaultLauncher()
                            Log.d(TAG, "Tentativa de definir MDM Launcher como padrão via Device Owner")
                        } catch (e: Exception) {
                            Log.w(TAG, "Não foi possível definir como padrão automaticamente", e)
                            // Mostrar toast informativo apenas se passou o cooldown
                            Log.d(TAG, "Configure o MDM Launcher como padrão nas configurações")
                        }
                    } else {
                        // Log informativo apenas se passou o cooldown
                        Log.d(TAG, "Configure o MDM Launcher como padrão nas configurações")
                    }
                    
                    // Salvar timestamp da última mensagem
                    prefs.edit().putLong("last_launcher_warning", currentTime).apply()
                }
            } else {
                Log.d(TAG, "MDM Launcher é o launcher padrão ✓")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar status do launcher padrão", e)
        }
    }
    
    private fun initViews() {
        appsRecyclerView = findViewById(R.id.apps_recycler_view)
        emptyLayout = findViewById(R.id.empty_layout)
        loadingProgress = findViewById(R.id.loading_progress)
        connectionStatusText = findViewById(R.id.connection_status_text)
        configButton = findViewById(R.id.config_button)
    }
    
    private fun saveData() {
        val editor = sharedPreferences.edit()
        val allowedAppsJson = gson.toJson(allowedApps)
        editor.putString("allowed_apps", allowedAppsJson)
        editor.putString("custom_device_name", customDeviceName)
        editor.putString("admin_password", adminPassword)
        // Não salvar apps instalados pois contêm Drawable que não pode ser serializado
        editor.apply()
        
        Log.d(TAG, "=== DEBUG: saveData ===")
        Log.d(TAG, "AllowedApps: $allowedApps")
        Log.d(TAG, "AllowedApps JSON: $allowedAppsJson")
        Log.d(TAG, "Dados salvos: ${allowedApps.size} apps permitidos, nome: $customDeviceName")
        Log.d(TAG, "======================")
    }
    
    private fun loadSavedData() {
        val savedAllowedApps = sharedPreferences.getString("allowed_apps", null)
        
        if (savedAllowedApps != null) {
            try {
                val type = object : TypeToken<List<String>>() {}.type
                allowedApps = gson.fromJson<List<String>>(savedAllowedApps, type)
                Log.d(TAG, "Apps permitidos carregados: ${allowedApps.size}")
                Log.d(TAG, "Lista carregada: $allowedApps")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao carregar apps permitidos", e)
                allowedApps = emptyList()
            }
        } else {
            Log.d(TAG, "Nenhum app permitido salvo, lista vazia")
            allowedApps = emptyList()
        }
        
        // Carregar nome personalizado do dispositivo
        customDeviceName = sharedPreferences.getString("custom_device_name", "") ?: ""
        Log.d(TAG, "Nome personalizado carregado: $customDeviceName")
        
        // Carregar senha de administrador
        adminPassword = sharedPreferences.getString("admin_password", "") ?: ""
        
        // Não carregar apps instalados salvos pois contêm Drawable que não pode ser serializado
        // Os apps instalados serão coletados novamente no onResume()
        Log.d(TAG, "Apps instalados serão coletados novamente no onResume()")
        
        // NÃO chamar updateAppsList() aqui pois installedApps ainda está vazio!
        // updateAppsList() será chamado no onResume() após coletar installedApps
        Log.d(TAG, "updateAppsList() será chamado no onResume() após coletar apps instalados")
    }
    
    private fun setupRecyclerView() {
        val layoutManager = GridLayoutManager(this, 3)
        appsRecyclerView.layoutManager = layoutManager
        
        // Otimizações de performance
        appsRecyclerView.setHasFixedSize(true)
        appsRecyclerView.setItemViewCacheSize(20) // Cache de 20 itens
        
        appAdapter = AppAdapter(emptyList()) { app ->
            launchApp(app)
        }
        appsRecyclerView.adapter = appAdapter
    }
    
    private fun setupConfigButton() {
        configButton.setOnClickListener {
            // Debug: 10 cliques rápidos para mostrar opção de remover Device Owner
            val now = System.currentTimeMillis()
            if (now - lastConfigButtonClickTime < 1000) {
                configButtonClickCount++
                if (configButtonClickCount >= 9) { // 10 cliques total
                    showRemoveDeviceOwnerDialog()
                    configButtonClickCount = 0
                    return@setOnClickListener
                }
            } else {
                configButtonClickCount = 0
            }
            lastConfigButtonClickTime = now
            
            showDeviceNameDialog()
        }
    }
    
    private fun setupMessageModal() {
        val inflater = layoutInflater
        messageModal = inflater.inflate(R.layout.modal_message, null)
        
        // Configurar botões do modal
        messageModal?.findViewById<ImageButton>(R.id.btn_close)?.setOnClickListener {
            hideMessageModal()
        }
        
        messageModal?.findViewById<Button>(R.id.btn_ok)?.setOnClickListener {
            hideMessageModal()
        }
        
        // Configurar overlay para fechar modal
        messageModal?.findViewById<View>(R.id.overlay)?.setOnClickListener {
            hideMessageModal()
        }
        
        // Adicionar modal ao layout principal
        val rootLayout = findViewById<ViewGroup>(android.R.id.content)
        rootLayout.addView(messageModal)
        
        // Inicialmente oculto
        messageModal?.visibility = View.GONE
    }
    
    private fun showMessageModal(message: String) {
        runOnUiThread {
            if (messageModal != null && !isMessageModalVisible) {
                lastNotificationMessage = message
                lastNotificationTimestamp = System.currentTimeMillis()
                
                // Atualizar texto da mensagem
                messageModal?.findViewById<TextView>(R.id.message_text)?.text = message
                
                // Atualizar timestamp
                val timestampText = "Recebido agora"
                messageModal?.findViewById<TextView>(R.id.message_timestamp)?.text = timestampText
                
                // Mostrar modal com animação
                messageModal?.visibility = View.VISIBLE
                messageModal?.alpha = 0f
                messageModal?.animate()?.let { animator ->
                    animator.alpha(1f)
                        .setDuration(300)
                        .start()
                }
                
                isMessageModalVisible = true
                hasShownPendingMessage = true
                Log.d(TAG, "Modal de mensagem exibido: $message")
            }
        }
    }
    
    private fun hideMessageModal() {
        runOnUiThread {
            if (messageModal != null && isMessageModalVisible) {
                messageModal?.animate()?.let { animator ->
                    animator.alpha(0f)
                        .setDuration(300)
                        .withEndAction {
                            messageModal?.visibility = View.GONE
                            isMessageModalVisible = false
                            hasShownPendingMessage = false
                            lastNotificationMessage = ""
                            lastNotificationTimestamp = 0L
                            Log.d(TAG, "Modal de mensagem ocultado e mensagem limpa")
                        }
                        .start()
                }
            }
        }
    }
    
    private fun checkAndRequestPermissions() {
        Log.d(TAG, "Verificando permissões essenciais...")
        
        // Verificar se o app foi reinstalado e precisa verificar todas as permissões
        checkForAppReinstall()
        
        // Solicitar permissões essenciais para funcionamento da web
        val essentialPermissions = arrayOf(
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        // Adicionar permissão de notificação para Android 13+ (API 33+)
        val permissionsToRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            essentialPermissions + Manifest.permission.POST_NOTIFICATIONS
        } else {
            essentialPermissions
        }
        
        val missingPermissions = permissionsToRequest.filter { permission ->
            ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missingPermissions.isNotEmpty()) {
            Log.d(TAG, "Solicitando permissões essenciais: $missingPermissions")
            ActivityCompat.requestPermissions(this, missingPermissions.toTypedArray(), 1001)
        } else {
            Log.d(TAG, "Todas as permissões essenciais já foram concedidas")
            onPermissionsComplete()
        }
    }
    
    private fun checkForAppReinstall() {
        try {
            val sharedPreferences = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            val currentInstallTime = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode.toLong()
            }
            
            val lastInstallTime = sharedPreferences.getLong("last_install_time", 0L)
            val wasReinstalled = lastInstallTime != currentInstallTime
            
            if (wasReinstalled) {
                Log.d(TAG, "🔄 APP REINSTALADO DETECTADO!")
                Log.d(TAG, "   Instalação anterior: $lastInstallTime")
                Log.d(TAG, "   Instalação atual: $currentInstallTime")
                
                // Marcar que precisa verificar todas as permissões
                sharedPreferences.edit()
                    .putBoolean("force_permission_check", true)
                    .putLong("last_install_time", currentInstallTime)
                    .putInt("permission_check_count", 0) // Resetar contador
                    .apply()
                
                Log.d(TAG, "✅ Flag de verificação de permissões ativada para reinstalação")
            } else {
                Log.d(TAG, "📱 App não foi reinstalado, continuando normalmente")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao verificar reinstalação", e)
        }
    }
    
    
    private fun onPermissionsComplete() {
        Log.d(TAG, "Permissões completadas - continuando inicialização")
        
        // Criar canal de notificação se a permissão foi concedida
        if (isNotificationPermissionGranted()) {
            createNotificationChannel()
        }
        
        // Continuar com a inicialização normal do app
        initializeApp()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
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
            Log.d(TAG, "Canal de notificação criado com sucesso")
        }
    }
    
    private fun initializeApp() {
        Log.d(TAG, "Inicializando app após permissões")
        
        // Permissões processadas - log apenas
        Log.d(TAG, "Permissões processadas! Inicializando app...")
        
        // Configurar UI
        initViews()
        setupRecyclerView()
        setupConfigButton()
        
        // Configurar rede e WebSocket
        setupNetworkMonitoring()
        startWebSocketService()
        setupWebSocketClient()
        
        // Carregar dados salvos
        loadSavedData()
        
        Log.d(TAG, "App inicializado com sucesso")
    }

    private fun checkPermissions() {
        val currentTime = System.currentTimeMillis()
        
        // Verificar se precisa forçar verificação completa (após reinstalação)
        val sharedPreferences = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
        val forcePermissionCheck = sharedPreferences.getBoolean("force_permission_check", false)
        
        if (forcePermissionCheck) {
            Log.d(TAG, "🔄 FORÇANDO VERIFICAÇÃO COMPLETA DE PERMISSÕES (reinstalação detectada)")
            // Resetar contadores para permitir solicitações
            permissionRequestCount = 0
            lastPermissionRequestTime = 0L
        } else {
            // Evitar solicitações de permissão muito frequentes (comportamento normal)
            if (permissionRequestCount > 3 && (currentTime - lastPermissionRequestTime) < 30000) {
                Log.w(TAG, "Muitas solicitações de permissão recentes ($permissionRequestCount), aguardando 30s")
                return
            }
        }
        
        // Sistema de permissões sequencial e organizado
        val permissionsToCheck = mutableListOf<PermissionItem>()
        
        // 1. Device Admin (mais importante - deve ser primeiro)
        val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
        if (!devicePolicyManager.isAdminActive(adminComponent)) {
            permissionsToCheck.add(PermissionItem(
                type = PermissionType.DEVICE_ADMIN,
                title = "Permissão de Administrador do Dispositivo",
                description = "Necessária para controlar o dispositivo como launcher MDM",
                priority = 1
            ))
        }
        
        // 2. Launcher Padrão (segundo mais importante)
        if (!isDefaultLauncher()) {
            permissionsToCheck.add(PermissionItem(
                type = PermissionType.DEFAULT_LAUNCHER,
                title = "Definir como Launcher Padrão",
                description = "Permite que este app gerencie a tela inicial",
                priority = 2
            ))
        }
        
        // 3. Usage Stats (terceiro)
        if (!isUsageStatsPermissionGranted()) {
            permissionsToCheck.add(PermissionItem(
                type = PermissionType.USAGE_STATS,
                title = "Permissão de Estatísticas de Uso",
                description = "Necessária para monitorar uso de aplicativos",
                priority = 3
            ))
        }
        
        // 4. Localização (quarto)
        if (!isLocationPermissionGranted()) {
            permissionsToCheck.add(PermissionItem(
                type = PermissionType.LOCATION,
                title = "Permissão de Localização",
                description = "Necessária para rastreamento de dispositivos",
                priority = 4
            ))
        }
        
        // 5. Notificações (quinto) - com proteção especial
        if (!isNotificationPermissionGranted()) {
            // Só solicitar notificações se não foi solicitado recentemente
            if ((currentTime - lastPermissionRequestTime) > 60000) { // 1 minuto
                permissionsToCheck.add(PermissionItem(
                    type = PermissionType.NOTIFICATIONS,
                    title = "Permissão de Notificações",
                    description = "Necessária para exibir notificações do sistema",
                    priority = 5
                ))
            } else {
                Log.d(TAG, "Solicitação de notificação ignorada (muito recente)")
            }
        }
        
        // Processar permissões em ordem de prioridade
        if (permissionsToCheck.isNotEmpty()) {
            permissionRequestCount++
            lastPermissionRequestTime = currentTime
            Log.d(TAG, "Solicitando permissões (tentativa #$permissionRequestCount)")
            permissionsToCheck.sortBy { it.priority }
            showPermissionDialog(permissionsToCheck)
        } else {
            // Todas as permissões concedidas, inicializar funcionalidades
            Log.d(TAG, "✅ TODAS AS PERMISSÕES CONCEDIDAS")
            
            // Remover flag de verificação forçada se estava ativa
            if (forcePermissionCheck) {
                sharedPreferences.edit()
                    .putBoolean("force_permission_check", false)
                    .apply()
                Log.d(TAG, "✅ Flag de verificação forçada removida - todas as permissões OK")
            }
            
            initializeAllFeatures()
        }
    }
    
    private fun showPermissionDialog(permissions: List<PermissionItem>) {
        val currentPermission = permissions.first()
        
        when (currentPermission.type) {
            PermissionType.DEVICE_ADMIN -> {
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, 
                    ComponentName(this, DeviceAdminReceiver::class.java))
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, 
                    currentPermission.description)
                startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN)
            }
            PermissionType.DEFAULT_LAUNCHER -> {
                setAsDefaultLauncher()
            }
            PermissionType.USAGE_STATS -> {
                val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                startActivityForResult(intent, REQUEST_CODE_USAGE_STATS)
            }
            PermissionType.LOCATION -> {
                checkLocationPermissions()
            }
            PermissionType.NOTIFICATIONS -> {
                requestNotificationPermission()
            }
        }
    }
    
    private fun initializeAllFeatures() {
        // Inicializar todas as funcionalidades após permissões concedidas
        initializeLocationTracking()
        Log.d(TAG, "Todas as permissões concedidas - funcionalidades inicializadas")
    }
    
    private fun setupNetworkMonitoring() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.d(TAG, "Rede disponível")
                isNetworkAvailable = true
                // Reconectar WebSocket quando rede voltar
                webSocketClient?.let { client ->
                    if (!client.isConnected()) {
                        client.forceReconnect()
                    }
                }
            }
            
            override fun onLost(network: Network) {
                Log.w(TAG, "Rede perdida")
                isNetworkAvailable = false
            }
            
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                val hasInternet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                val isValidated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                
                if (hasInternet && isValidated) {
                    Log.d(TAG, "Rede com internet validada")
                    isNetworkAvailable = true
                    // Reconectar WebSocket se necessário
                    webSocketClient?.let { client ->
                        if (!client.isConnected()) {
                            client.forceReconnect()
                        }
                    }
                }
            }
        }
        
        // Registrar callback para monitoramento de rede
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val networkRequest = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivityManager?.registerNetworkCallback(networkRequest, networkCallback!!)
        }
    }
    
    private fun initializeNetworkMonitor() {
        Log.d(TAG, "🌐 Inicializando NetworkMonitor...")
        networkMonitor = NetworkMonitor(this)
        
        networkMonitor?.startMonitoring { isConnected ->
            Log.d(TAG, "🔄 Mudança de conectividade detectada: $isConnected")
            
            if (isConnected) {
                Log.d(TAG, "✅ Rede disponível - notificando mudança de rede...")
                
                // Notificar WebSocketService sobre mudança de rede
                webSocketService?.onNetworkChanged()
                
                // Aguardar um pouco para a rede se estabilizar
                scope.launch {
                    delay(1000) // Reduzido de 2s para 1s - mais responsivo
                    attemptReconnection()
                }
            } else {
                Log.d(TAG, "❌ Rede indisponível - atualizando status de conexão")
                // Atualizar status imediatamente quando rede é perdida
                runOnUiThread {
                    updateConnectionStatus(false)
                }
            }
        }
        
        Log.d(TAG, "✅ NetworkMonitor inicializado")
        
        // Verificação adicional mais frequente para mudanças de rede
        scope.launch {
            while (isActive) {
                delay(1000) // Verificar a cada 1 segundo para mudanças rápidas
                
                val hasNetwork = networkMonitor?.isConnected?.value ?: false
                val currentText = connectionStatusText.text.toString()
                
                // Detectar mudança de rede imediatamente
                if (!hasNetwork && currentText != "Sem Rede") {
                    Log.d(TAG, "🚨 Mudança de rede detectada: SEM REDE")
                    runOnUiThread {
                        updateConnectionStatus(false)
                    }
                } else if (hasNetwork && currentText == "Sem Rede") {
                    Log.d(TAG, "🚨 Mudança de rede detectada: REDE VOLTOU")
                    runOnUiThread {
                        updateConnectionStatus(false) // Vai mostrar "Reconectando..."
                    }
                }
            }
        }
        
        // Verificação periódica de conectividade para garantir status correto
        scope.launch {
            while (isActive) {
                delay(3000) // Verificar a cada 3 segundos (era 10s) - mais responsivo
                
                val hasNetwork = networkMonitor?.isConnected?.value ?: false
                val isWebSocketConnected = isServiceBound && webSocketService?.isConnected() == true
                
                // Se não há rede, garantir que status seja atualizado
                if (!hasNetwork && connectionStatusText.text != "Sem Rede") {
                    Log.d(TAG, "🔄 Verificação periódica: sem rede detectada")
                    runOnUiThread {
                        updateConnectionStatus(false)
                    }
                }
                // Se há rede mas WebSocket não está conectado, mostrar "Reconectando"
                else if (hasNetwork && !isWebSocketConnected && connectionStatusText.text != "Reconectando...") {
                    Log.d(TAG, "🔄 Verificação periódica: rede OK mas WebSocket desconectado")
                    runOnUiThread {
                        updateConnectionStatus(false)
                    }
                }
                // Se há rede e WebSocket conectado, garantir que status seja "Conectado"
                else if (hasNetwork && isWebSocketConnected && connectionStatusText.text != "Conectado") {
                    Log.d(TAG, "🔄 Verificação periódica: conexão OK detectada")
                    runOnUiThread {
                        updateConnectionStatus(true)
                    }
                }
            }
        }
    }
    
    private fun attemptReconnection() {
        Log.d(TAG, "🔄 Tentando reconexão após retorno da rede...")
        
        scope.launch {
            try {
                // Aguardar um pouco para a rede se estabilizar completamente
                delay(2000) // Reduzido de 3s para 2s - mais responsivo
                
                Log.d(TAG, "🔍 Descobrindo servidor após reconexão de rede...")
                val newServerUrl = ServerDiscovery.discoverServer(this@MainActivity)
                Log.d(TAG, "✅ Servidor descoberto: $newServerUrl")
                
                // Salvar URL descoberta para uso futuro
                ServerDiscovery.saveDiscoveredServerUrl(this@MainActivity, newServerUrl)
                
                // SEMPRE reiniciar o WebSocketService para garantir nova conexão
                Log.d(TAG, "🔄 Reiniciando WebSocketService com novo servidor...")
                
                // Parar serviço atual se estiver rodando
                if (isServiceBound) {
                    Log.d(TAG, "Parando WebSocketService atual...")
                    stopService(Intent(this@MainActivity, WebSocketService::class.java))
                    delay(1000) // Aguardar parada completa
                }
                
                // Iniciar novo serviço
                Log.d(TAG, "Iniciando novo WebSocketService...")
                startWebSocketService()
                
                // Aguardar um pouco e verificar se conectou
                delay(3000) // Reduzido de 5s para 3s - mais responsivo
                
                if (isServiceBound && webSocketService?.isConnected() == true) {
                    Log.d(TAG, "✅ Reconexão bem-sucedida!")
                } else {
                    Log.w(TAG, "⚠️ Reconexão pode ter falhado, tentando novamente...")
                    // Tentar mais uma vez após 5 segundos (reduzido de 10s)
                    delay(5000)
                    if (!isServiceBound || webSocketService?.isConnected() != true) {
                        Log.d(TAG, "🔄 Segunda tentativa de reconexão...")
                        startWebSocketService()
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro durante tentativa de reconexão", e)
                
                // Fallback: tentar reconectar mesmo sem descoberta
                try {
                    Log.d(TAG, "🔄 Tentando fallback de reconexão...")
                    startWebSocketService()
                } catch (fallbackError: Exception) {
                    Log.e(TAG, "❌ Fallback de reconexão também falhou", fallbackError)
                }
            }
        }
    }
    
    private fun isDefaultLauncher(): Boolean {
        val intent = Intent(Intent.ACTION_MAIN)
        intent.addCategory(Intent.CATEGORY_HOME)
        val resolveInfo = packageManager.resolveActivity(intent, 0)
        return resolveInfo?.activityInfo?.packageName == packageName
    }
    
    private fun isLocationPermissionGranted(): Boolean {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
    
    private fun isNotificationPermissionGranted(): Boolean {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
    
    private fun requestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_CODE_NOTIFICATIONS
            )
        }
    }
    
    private fun isUsageStatsPermissionGranted(): Boolean {
        val appOpsManager = getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        val mode = appOpsManager.checkOpNoThrow(
            android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            packageName
        )
        return mode == android.app.AppOpsManager.MODE_ALLOWED
    }
    
    private fun checkLocationPermissions() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val fineLocationPermission = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            val coarseLocationPermission = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            
            if (fineLocationPermission != PackageManager.PERMISSION_GRANTED || 
                coarseLocationPermission != PackageManager.PERMISSION_GRANTED) {
                
                requestPermissions(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ),
                    REQUEST_CODE_LOCATION
                )
            } else {
                // Permissões já concedidas, inicializar rastreamento
                initializeLocationTracking()
            }
        } else {
            // Para versões anteriores ao Android 6.0, as permissões são concedidas na instalação
            initializeLocationTracking()
        }
    }
    
    private fun initializeLocationTracking() {
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        
        // Verificar se o GPS está habilitado
        val isGpsEnabled = locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) ?: false
        val isNetworkEnabled = locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ?: false
        
        if (isGpsEnabled || isNetworkEnabled) {
            startLocationTracking()
            Log.d(TAG, "Rastreamento de localização inicializado")
        } else {
            Log.w(TAG, "GPS e Network Provider desabilitados")
            // Solicitar ao usuário para habilitar a localização
            val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            startActivity(intent)
        }
    }
    
    private fun startLocationTracking() {
        if (locationManager == null) return
        
        try {
            // Parar rastreamento anterior se existir
            stopLocationTracking()
            
            locationListener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    Log.d(TAG, "📍 Nova localização recebida:")
                    Log.d(TAG, "   Provider: ${location.provider}")
                    Log.d(TAG, "   Precisão: ${location.accuracy}m")
                    Log.d(TAG, "   Coordenadas: ${location.latitude}, ${location.longitude}")
                    
                    // Verificar se a localização é válida
                    if (location.accuracy <= 0) {
                        Log.w(TAG, "⚠️ Localização inválida - precisão <= 0")
                        return
                    }
                    
                    // Aceitar apenas localizações com precisão razoável (máximo 50m para GPS, 100m para Network)
                    val maxAccuracy = if (location.provider == LocationManager.GPS_PROVIDER) 50f else 100f
                    if (location.accuracy > maxAccuracy) {
                        Log.w(TAG, "⚠️ Localização ignorada - precisão muito baixa (${location.accuracy}m > ${maxAccuracy}m)")
                        return
                    }
                    
                    // Verificar se é mais precisa que a anterior
                    if (lastKnownLocation == null || 
                        location.accuracy < lastKnownLocation!!.accuracy || 
                        (location.provider == LocationManager.GPS_PROVIDER && lastKnownLocation!!.provider == LocationManager.NETWORK_PROVIDER)) {
                        
                        lastKnownLocation = location
                        isLocationTrackingEnabled = true
                        
                        // Enviar localização via WebSocket
                        sendLocationUpdate(location)
                        
                        Log.d(TAG, "✅ Localização aceita: ${location.latitude}, ${location.longitude} (precisão: ${location.accuracy}m, provider: ${location.provider})")
                    } else {
                        Log.d(TAG, "⚠️ Localização ignorada - menos precisa que a anterior (${location.accuracy}m vs ${lastKnownLocation!!.accuracy}m)")
                    }
                }
                
                override fun onProviderEnabled(provider: String) {
                    Log.d(TAG, "Provider de localização habilitado: $provider")
                }
                
                override fun onProviderDisabled(provider: String) {
                    Log.d(TAG, "Provider de localização desabilitado: $provider")
                }
                
                override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {
                    Log.d(TAG, "Status do provider $provider: $status")
                }
            }
            
            // Solicitar atualizações de localização
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                locationManager?.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    LOCATION_UPDATE_INTERVAL,
                    LOCATION_UPDATE_DISTANCE,
                    locationListener!!
                )
                Log.d(TAG, "GPS Provider registrado")
            }
            
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                locationManager?.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    LOCATION_UPDATE_INTERVAL,
                    LOCATION_UPDATE_DISTANCE,
                    locationListener!!
                )
                Log.d(TAG, "Network Provider registrado")
            }
            
            // Obter última localização conhecida
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                lastKnownLocation = locationManager?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                if (lastKnownLocation != null) {
                    sendLocationUpdate(lastKnownLocation!!)
                    Log.d(TAG, "Última localização GPS enviada: ${lastKnownLocation!!.latitude}, ${lastKnownLocation!!.longitude}")
                } else {
                    // Tentar Network Provider como fallback
                    lastKnownLocation = locationManager?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    if (lastKnownLocation != null) {
                        sendLocationUpdate(lastKnownLocation!!)
                        Log.d(TAG, "Última localização Network enviada: ${lastKnownLocation!!.latitude}, ${lastKnownLocation!!.longitude}")
                    }
                }
            }
            
            isLocationTrackingEnabled = true
            Log.d(TAG, "Rastreamento de localização iniciado")
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Erro de segurança ao acessar localização", e)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao inicializar rastreamento de localização", e)
        }
    }
    
    private fun sendLocationUpdate(location: Location) {
        val deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
        
        // Salvar no histórico de localização
        LocationHistoryManager.saveLocation(this, location)
        
        // Verificar eventos de geofencing
        val geofenceEvents = GeofenceManager.checkGeofenceEvents(this, location)
        for (event in geofenceEvents) {
            Log.d(TAG, "Evento de geofencing: ${event.eventType} - ${event.zoneName}")
            // Enviar evento de geofencing
            sendGeofenceEvent(event)
        }
        
        val locationData = mapOf(
            "type" to "location_update",
            "deviceId" to deviceId,
            "latitude" to location.latitude,
            "longitude" to location.longitude,
            "accuracy" to location.accuracy,
            "timestamp" to System.currentTimeMillis(),
            "provider" to location.provider
        )
        
        val jsonMessage = gson.toJson(locationData)
        Log.d(TAG, "Enviando localização: $jsonMessage")
        
        // Enviar via serviço se disponível, senão via cliente local
        if (isServiceBound && webSocketService?.isConnected() == true) {
            webSocketService?.sendMessage(jsonMessage)
            Log.d(TAG, "Localização enviada via WebSocketService")
        } else {
            Log.w(TAG, "WebSocket não conectado, localização não enviada")
        }
    }
    
    private fun sendGeofenceEvent(event: GeofenceEvent) {
        val deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
        val eventData = mapOf(
            "type" to "geofence_event",
            "deviceId" to deviceId,
            "zoneId" to event.zoneId,
            "zoneName" to event.zoneName,
            "eventType" to event.eventType,
            "latitude" to event.latitude,
            "longitude" to event.longitude,
            "timestamp" to event.timestamp,
            "accuracy" to event.accuracy
        )
        
        val jsonMessage = gson.toJson(eventData)
        Log.d(TAG, "Enviando evento de geofencing: $jsonMessage")
        
        // Enviar via serviço se disponível, senão via cliente local
        if (isServiceBound && webSocketService?.isConnected() == true) {
            webSocketService?.sendMessage(jsonMessage)
            Log.d(TAG, "Evento de geofencing enviado via WebSocketService")
        } else {
            Log.w(TAG, "WebSocket não conectado, evento de geofencing não enviado")
        }
    }
    
    private fun stopLocationTracking() {
        try {
            locationListener?.let { listener ->
                locationManager?.removeUpdates(listener)
                Log.d(TAG, "LocationListener removido")
            }
            locationListener = null
            isLocationTrackingEnabled = false
            Log.d(TAG, "Rastreamento de localização parado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar rastreamento de localização", e)
        }
    }
    
    private fun setAsDefaultLauncher() {
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                // Método 1: Usar addPersistentPreferredActivity
                val launcherComponent = ComponentName(this, MainActivity::class.java)
                val intentFilter = IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                }
                devicePolicyManager.addPersistentPreferredActivity(
                    adminComponent,
                    intentFilter,
                    launcherComponent
                )
                
                // Método simplificado - apenas definir como preferido
                
                Log.d(TAG, "MDM Launcher definido como padrão com sucesso")
                
                // Mostrar mensagem de confirmação
                runOnUiThread {
                    Toast.makeText(this, "✅ Launcher MDM ativo como padrão", Toast.LENGTH_SHORT).show()
                }
            } else {
                Log.w(TAG, "App não é Device Owner, não é possível definir como launcher padrão automaticamente")
                
                // Fallback: abrir configurações para o usuário definir manualmente
                try {
                    val intent = Intent(Settings.ACTION_HOME_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao abrir configurações de launcher", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao definir launcher padrão", e)
        }
    }
    
    private fun startWebSocketService() {
        Log.d(TAG, "Iniciando WebSocketService em foreground")
        val intent = Intent(this, WebSocketService::class.java)
        startForegroundService(intent)
        
        // Conectar ao serviço para comunicação
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }
    
    private fun startLocationService() {
        Log.d(TAG, "📍 Iniciando LocationService em foreground")
        try {
            val intent = Intent(this, LocationService::class.java)
            startForegroundService(intent)
            Log.d(TAG, "✅ LocationService iniciado com sucesso")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar LocationService", e)
        }
    }
    
    private fun sendLocationToServer(locationData: String) {
        try {
            Log.d(TAG, "📤 Enviando dados de localização para o servidor")
            
            // Usar apenas WebSocketService (conexão unificada)
            if (isServiceBound && webSocketService?.isConnected() == true) {
                webSocketService?.sendMessage(locationData)
                Log.d(TAG, "✅ Localização enviada via WebSocketService")
            } else {
                Log.w(TAG, "⚠️ WebSocketService não disponível para enviar localização")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao enviar localização para o servidor", e)
        }
    }
    
    private fun setupWebSocketClient() {
        Log.d(TAG, "🔧 setupWebSocketClient() chamado")
        val deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
        Log.d(TAG, "🔧 DeviceId inicial: ${deviceId.takeLast(8)}")
        
        // Descobrir servidor automaticamente em background
        scope.launch {
            try {
                Log.d(TAG, "🔍 Iniciando descoberta do servidor...")
                val serverUrl = com.mdm.launcher.utils.ServerDiscovery.discoverServer(this@MainActivity)
                
                val deviceIdInfo = com.mdm.launcher.utils.DeviceIdManager.getDeviceIdInfo(this@MainActivity)
                
                Log.d(TAG, "=== CONFIGURAÇÃO WEBSOCKET ===")
                Log.d(TAG, "DeviceId obtido: ${deviceId.takeLast(8)}")
                Log.d(TAG, "Fonte do DeviceId: ${deviceIdInfo["source"]}")
                Log.d(TAG, "Server URL descoberta: $serverUrl")
                Log.d(TAG, "Service bound: $isServiceBound")
                Log.d(TAG, "=============================")
                
                // Salvar URL descoberta para uso futuro
                com.mdm.launcher.utils.ServerDiscovery.saveDiscoveredServerUrl(this@MainActivity, serverUrl)
                
                // DeviceIdManager sempre retorna um ID válido
                Log.d(TAG, "✅ DeviceId válido: ${deviceId.takeLast(8)}")
                setupWebSocketWithId(deviceId, serverUrl)
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro na descoberta do servidor: ${e.message}", e)
                // Fallback: usar IP do emulador
                val fallbackUrl = "ws://10.0.2.2:3002"
                Log.w(TAG, "⚠️ Usando URL fallback: $fallbackUrl")
                setupWebSocketWithId(deviceId, fallbackUrl)
            }
        }
    }
    
    private fun setupWebSocketWithId(deviceId: String, serverUrl: String) {
        Log.d(TAG, "📡 setupWebSocketWithId chamado - URL: $serverUrl, DeviceId: ${deviceId.takeLast(8)}")
        
        // Se o serviço estiver disponível, usar ele; senão, criar cliente local
        if (isServiceBound && webSocketService != null) {
            Log.d(TAG, "🔧 Usando WebSocketService para comunicação")
            Log.d(TAG, "🔧 Service conectado: ${webSocketService?.isConnected()}")
            // O serviço já está gerenciando a conexão WebSocket
            // Forçar reconexão para garantir que use a URL descoberta
            scope.launch {
                delay(2000) // Aguardar service inicializar
                if (webSocketService?.isConnected() != true) {
                    Log.w(TAG, "⚠️ Service não conectado, tentando forçar reconexão...")
                }
            }
        } else {
            Log.d(TAG, "🔧 Usando WebSocketClient singleton como fallback")
            
            // Destruir instância antiga antes de criar nova
            WebSocketClient.destroyInstance()
            
            webSocketClient = WebSocketClient.getInstance(
                serverUrl = serverUrl,
                deviceId = deviceId,
                onMessage = { message -> handleWebSocketMessage(message) },
                onConnectionChange = { connected -> updateConnectionStatus(connected) }
            )
            
            Log.d(TAG, "🚀 Conectando WebSocket...")
            webSocketClient?.connect()
            
            // Iniciar timer periódico para enviar dados a cada 30 segundos
            startPeriodicSync()
        }
        
        // Enviar informações do dispositivo de forma otimizada
        scope.launch {
            try {
                // Sempre coletar informações completas do dispositivo
                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                
                Log.d(TAG, "=== DADOS COLETADOS DO DISPOSITIVO ===")
                Log.d(TAG, "Bateria: ${deviceInfo.batteryLevel}%")
                Log.d(TAG, "Apps instalados: ${deviceInfo.installedAppsCount}")
                Log.d(TAG, "Apps permitidos: ${deviceInfo.allowedApps.size}")
                Log.d(TAG, "Armazenamento total: ${deviceInfo.storageTotal / (1024*1024*1024)}GB")
                Log.d(TAG, "Armazenamento usado: ${deviceInfo.storageUsed / (1024*1024*1024)}GB")
                Log.d(TAG, "Serial: ${deviceInfo.serialNumber}")
                Log.d(TAG, "IMEI: ${deviceInfo.imei}")
                Log.d(TAG, "=====================================")
                
                // Verificar se os dados são válidos
                if (deviceInfo.batteryLevel == 0 && deviceInfo.installedAppsCount == 0 && deviceInfo.storageTotal == 0L) {
                    Log.e(TAG, "⚠️ DADOS ZERADOS DETECTADOS! Problema na coleta de dados.")
                } else {
                    Log.d(TAG, "✓ Dados coletados com sucesso")
                }
                
                installedApps = deviceInfo.installedApps
                lastAppUpdateTime = System.currentTimeMillis()
                saveData()
                updateAppsList()
                
                // Testar serialização antes de enviar
                try {
                    val jsonTest = gson.toJson(deviceInfo)
                    Log.d(TAG, "=== TESTE SERIALIZAÇÃO ===")
                    Log.d(TAG, "JSON length: ${jsonTest.length}")
                    Log.d(TAG, "JSON preview: ${jsonTest.take(200)}...")
                    Log.d(TAG, "========================")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ ERRO NA SERIALIZAÇÃO: ${e.message}")
                }
                
                // Enviar status completo do dispositivo
                webSocketClient?.sendDeviceStatus(deviceInfo)
                
                Log.d(TAG, "Informações do dispositivo enviadas: ${deviceInfo.installedApps.size} apps")
                Log.d(TAG, "=== DEBUG: Apps sendo enviados ===")
                deviceInfo.installedApps.take(5).forEach { app ->
                    Log.d(TAG, "  App: ${app.appName} (${app.packageName})")
                }
                Log.d(TAG, "=====================================")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao coletar informações do dispositivo", e)
            }
        }
    }
    
    private fun handleWebSocketMessage(message: String) {
        try {
            val jsonObject = gson.fromJson(message, Map::class.java)
            val type = jsonObject["type"] as? String
            
            when (type) {
                "update_app_permissions" -> {
                    Log.d(TAG, "═══════════════════════════════════════════")
                    Log.d(TAG, "📱 UPDATE_APP_PERMISSIONS RECEBIDO")
                    Log.d(TAG, "═══════════════════════════════════════════")
                    val data = jsonObject["data"] as? Map<*, *>
                    Log.d(TAG, "Data recebida: $data")
                    val allowedAppsList = data?.get("allowedApps") as? List<*>
                    Log.d(TAG, "Apps permitidos recebidos (raw): $allowedAppsList")
                    Log.d(TAG, "Tipo: ${allowedAppsList?.javaClass?.name}")
                    Log.d(TAG, "Quantidade: ${allowedAppsList?.size ?: 0}")
                    
                    val previousAllowedApps = allowedApps.toList()
                    allowedApps = allowedAppsList?.map { it.toString() } ?: emptyList()
                    
                    Log.d(TAG, "───────────────────────────────────────────")
                    Log.d(TAG, "Apps permitidos ANTES: ${previousAllowedApps.size}")
                    previousAllowedApps.forEach { Log.d(TAG, "  - $it") }
                    Log.d(TAG, "───────────────────────────────────────────")
                    Log.d(TAG, "Apps permitidos DEPOIS: ${allowedApps.size}")
                    allowedApps.forEach { Log.d(TAG, "  - $it") }
                    Log.d(TAG, "───────────────────────────────────────────")
                    Log.d(TAG, "Apps instalados ATUAIS: ${installedApps.size}")
                    Log.d(TAG, "───────────────────────────────────────────")
                    
                    saveData() // Salvar dados recebidos da web
                    Log.d(TAG, "✅ Dados salvos em SharedPreferences")
                    
                    // FORÇAR RECARGA dos apps instalados se lista estiver vazia ou desatualizada
                    if (installedApps.isEmpty()) {
                        Log.w(TAG, "⚠️ Lista de apps instalados está vazia! Recarregando...")
                        scope.launch {
                            try {
                                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                                installedApps = deviceInfo.installedApps
                                lastAppUpdateTime = System.currentTimeMillis()
                                Log.d(TAG, "✅ Apps instalados recarregados: ${installedApps.size}")
                                
                                // Agora atualizar a lista
                                markUserInteraction()
                                updateAppsList()
                                Log.d(TAG, "✅ Apps list atualizada no launcher após recarga")
                                
                                // Feedback visual
                                runOnUiThread {
                                    Toast.makeText(this@MainActivity, "✅ Permissões atualizadas: ${allowedApps.size} apps", Toast.LENGTH_SHORT).show()
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "❌ Erro ao recarregar apps instalados", e)
                            }
                        }
                    } else {
                        // Apps instalados já existem, apenas atualizar filtro
                        markUserInteraction()
                        updateAppsList()
                        Log.d(TAG, "✅ Apps list atualizada no launcher")
                        
                        // Feedback visual
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "✅ Permissões atualizadas: ${allowedApps.size} apps", Toast.LENGTH_SHORT).show()
                        }
                    }
                    
                    Log.d(TAG, "═══════════════════════════════════════════")
                }
                "set_admin_password" -> {
                    Log.d(TAG, "🔐 === RECEBENDO SENHA DE ADMINISTRADOR ===")
                    Log.d(TAG, "Mensagem completa: $message")
                    Log.d(TAG, "JSON Object: $jsonObject")
                    
                    val data = jsonObject["data"] as? Map<*, *>
                    Log.d(TAG, "Data extraída: $data")
                    
                    val password = data?.get("password") as? String
                    Log.d(TAG, "Password extraída: '$password'")
                    Log.d(TAG, "Password é null? ${password == null}")
                    Log.d(TAG, "Password vazia? ${password?.isEmpty()}")
                    Log.d(TAG, "Password tamanho: ${password?.length}")
                    Log.d(TAG, "Password hashCode: ${password?.hashCode()}")
                    Log.d(TAG, "Password bytes: ${password?.toByteArray()?.contentToString()}")
                    Log.d(TAG, "Password trim: '${password?.trim()}'")
                    
                    if (password != null && password.isNotEmpty()) {
                        val trimmedPassword = password.trim()
                        adminPassword = trimmedPassword
                        saveData()
                        Log.d(TAG, "✅ Senha de administrador definida via WebSocket: '$trimmedPassword'")
                        Log.d(TAG, "✅ Senha salva no SharedPreferences")
                        Log.d(TAG, "✅ adminPassword atualizado para: '$adminPassword'")
                        
                    } else {
                        Log.e(TAG, "❌ ERRO: Password é null ou vazia na mensagem set_admin_password")
                        Log.e(TAG, "Data completa: $data")
                    }
                    Log.d(TAG, "========================================")
                }
                "request_location" -> {
                    // Solicitar localização atual
                    if (lastKnownLocation != null) {
                        sendLocationUpdate(lastKnownLocation!!)
                    } else {
                        Log.w(TAG, "Nenhuma localização conhecida disponível")
                    }
                }
                "toggle_location_tracking" -> {
                    val enabled = jsonObject["enabled"] as? Boolean ?: false
                    if (enabled && !isLocationTrackingEnabled) {
                        initializeLocationTracking()
                    } else if (!enabled && isLocationTrackingEnabled) {
                        stopLocationTracking()
                    }
                }
                "set_location_interval" -> {
                    val interval = jsonObject["interval"] as? Long
                    if (interval != null) {
                        // Atualizar intervalo de localização
                        Log.d(TAG, "Intervalo de localização atualizado: $interval ms")
                        // Reiniciar rastreamento com novo intervalo
                        stopLocationTracking()
                        startLocationTracking()
                    }
                }
                "enable_location" -> {
                    // Ativar localização
                    initializeLocationTracking()
                }
                "support_message_received" -> {
                    Log.d(TAG, "═══════════════════════════════════════")
                    Log.d(TAG, "✅ CONFIRMAÇÃO DE MENSAGEM RECEBIDA")
                    Log.d(TAG, "MessageId: ${jsonObject["messageId"]}")
                    Log.d(TAG, "Status: ${jsonObject["status"]}")
                    Log.d(TAG, "═══════════════════════════════════════")
                    // Mensagem confirmada pelo servidor
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "✅ Mensagem recebida pelo servidor!", Toast.LENGTH_SHORT).show()
                    }
                }
                "support_message_error" -> {
                    Log.e(TAG, "❌ Erro ao enviar mensagem de suporte: ${jsonObject["error"]}")
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "❌ Erro: ${jsonObject["error"]}", Toast.LENGTH_LONG).show()
                    }
                }
                "show_notification" -> {
                    // Mostrar notificação no dispositivo
                    val title = jsonObject["title"] as? String ?: "MDM Launcher"
                    val body = jsonObject["body"] as? String ?: "Nova notificação"
                    Log.d(TAG, "=== RECEBENDO NOTIFICAÇÃO ===")
                    Log.d(TAG, "Título: $title")
                    Log.d(TAG, "Corpo: $body")
                    showNotification(title, body)
                    
                    // Enviar confirmação de recebimento para o servidor
                    val confirmationMessage = mapOf(
                        "type" to "notification_received",
                        "deviceId" to deviceId,
                        "title" to title,
                        "body" to body,
                        "timestamp" to System.currentTimeMillis()
                    )
                    
                    if (isServiceBound && webSocketService?.isConnected() == true) {
                        webSocketService?.sendMessage(gson.toJson(confirmationMessage))
                        Log.d(TAG, "Confirmação de notificação enviada via WebSocketService")
                    }
                }
                "reboot_device" -> {
                    // Reiniciar dispositivo
                    Log.d(TAG, "Comando de reinicialização recebido")
                    rebootDevice()
                }
                "lock_device" -> {
                    // Bloquear dispositivo
                    Log.d(TAG, "Comando de bloqueio recebido")
                    lockDevice()
                }
                "wipe_device" -> {
                    // Factory reset (apenas com Device Owner)
                    Log.d(TAG, "Comando de wipe recebido")
                    val data = jsonObject["data"] as? Map<*, *>
                    val confirmCode = data?.get("confirmCode") as? String
                    wipeDevice(confirmCode)
                }
                "clear_app_cache" -> {
                    // Limpar cache de app específico
                    val data = jsonObject["data"] as? Map<*, *>
                    val packageName = data?.get("packageName") as? String
                    if (packageName != null) {
                        clearAppCache(packageName)
                    }
                }
                "disable_camera" -> {
                    // Desabilitar câmera
                    val data = jsonObject["data"] as? Map<*, *>
                    val disabled = data?.get("disabled") as? Boolean ?: true
                    setCameraDisabled(disabled)
                }
                "set_kiosk_mode" -> {
                    // Ativar/desativar modo quiosque
                    val data = jsonObject["data"] as? Map<*, *>
                    val packageName = data?.get("packageName") as? String ?: ""
                    val enabled = data?.get("enabled") as? Boolean ?: false
                    setKioskMode(packageName, enabled)
                }
                "install_app" -> {
                    // Instalar app remoto
                    val data = jsonObject["data"] as? Map<*, *>
                    val url = data?.get("url") as? String
                    if (url != null) {
                        Log.d(TAG, "Comando de instalação de app: $url")
                        // Implementar download e instalação
                    }
                }
                "uninstall_app" -> {
                    // Desinstalar app
                    val data = jsonObject["data"] as? Map<*, *>
                    val packageName = data?.get("packageName") as? String
                    if (packageName != null) {
                        uninstallApp(packageName)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem WebSocket", e)
        }
    }
    
    private fun updateConnectionStatus(connected: Boolean) {
        runOnUiThread {
            val currentText = connectionStatusText.text.toString()
            val hasNetwork = networkMonitor?.isConnected?.value ?: false
            
            if (connected) {
                // Só atualizar se realmente mudou
                if (currentText != "Conectado") {
                    connectionStatusText.text = "Conectado"
                    connectionStatusText.setTextColor(resources.getColor(R.color.connection_connected, null))
                    Log.d(TAG, "✅ Status de conexão: CONECTADO")
                    
                    // IMPORTANTE: Enviar dados completos do dispositivo assim que conectar
                    Log.d(TAG, "📤 Conexão estabelecida - coletando e enviando dados do dispositivo...")
                    scope.launch {
                        try {
                            val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                            
                            Log.d(TAG, "=== ENVIANDO DADOS APÓS CONEXÃO ===")
                            Log.d(TAG, "Bateria: ${deviceInfo.batteryLevel}%")
                            Log.d(TAG, "Apps: ${deviceInfo.installedAppsCount}")
                            Log.d(TAG, "DeviceId: ${deviceInfo.deviceId.takeLast(4)}")
                            Log.d(TAG, "===================================")
                            
                            webSocketService?.sendDeviceStatus(deviceInfo)
                            Log.d(TAG, "✅ Dados completos enviados após conexão via WebSocketService!")
                            Log.d(TAG, "=== DEBUG: Apps após conexão ===")
                            Log.d(TAG, "  Total apps: ${deviceInfo.installedApps.size}")
                            Log.d(TAG, "  Apps count: ${deviceInfo.installedAppsCount}")
                            deviceInfo.installedApps.take(3).forEach { app ->
                                Log.d(TAG, "    App: ${app.appName} (${app.packageName})")
                            }
                            Log.d(TAG, "=================================")
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ Erro ao enviar dados após conexão", e)
                        }
                    }
                }
            } else {
                // Verificar se é problema de rede ou WebSocket
                if (!hasNetwork) {
                    if (currentText != "Sem Rede") {
                        connectionStatusText.text = "Sem Rede"
                        connectionStatusText.setTextColor(resources.getColor(R.color.connection_disconnected, null))
                        Log.d(TAG, "❌ Status de conexão: SEM REDE")
                    }
                } else {
                    if (currentText != "Reconectando...") {
                        connectionStatusText.text = "Reconectando..."
                        connectionStatusText.setTextColor(resources.getColor(R.color.connection_disconnected, null))
                        Log.d(TAG, "🔄 Status de conexão: RECONECTANDO")
                        
                        // Forçar reconexão apenas se necessário
                        if (!isServiceBound || webSocketService?.isConnected() != true) {
                            Log.d(TAG, "Tentando reconectar WebSocketService")
                            startWebSocketService()
                        }
                    }
                }
            }
        }
    }
    
    private fun updateAppsList() {
        runOnUiThread {
            Log.d(TAG, "=== DEBUG: updateAppsList() chamada ===")
            Log.d(TAG, "Apps instalados: ${installedApps.size}")
            Log.d(TAG, "Apps permitidos: ${allowedApps.size}")
            Log.d(TAG, "Lista de apps permitidos: $allowedApps")
            
            // Debug detalhado de cada app instalado
            Log.d(TAG, "=== APPS INSTALADOS DETALHADOS ===")
            installedApps.forEach { app ->
                val isAllowed = allowedApps.contains(app.packageName)
                Log.d(TAG, "App: ${app.appName}")
                Log.d(TAG, "  Package: ${app.packageName}")
                Log.d(TAG, "  Permitido: $isAllowed")
                Log.d(TAG, "  ---")
            }
            Log.d(TAG, "==================================")
            
            val filteredApps = installedApps.filter { app ->
                val isAllowed = allowedApps.contains(app.packageName)
                if (!isAllowed) {
                    Log.d(TAG, "❌ App ${app.appName} (${app.packageName}) não está na lista de permitidos")
                } else {
                    Log.d(TAG, "✅ App ${app.appName} (${app.packageName}) está permitido")
                }
                isAllowed
            }
            
            Log.d(TAG, "=== RESULTADO FINAL ===")
            Log.d(TAG, "Apps filtrados para exibição: ${filteredApps.size}")
            filteredApps.forEach { app ->
                Log.d(TAG, "✅ App permitido: ${app.appName} (${app.packageName})")
            }
            Log.d(TAG, "======================")
            
            // Otimização: reutilizar adapter existente se possível
            if (appAdapter == null) {
                appAdapter = AppAdapter(filteredApps) { app ->
                    launchApp(app)
                }
                appsRecyclerView.adapter = appAdapter
                Log.d(TAG, "Novo adapter criado com ${filteredApps.size} apps")
            } else {
                appAdapter?.updateApps(filteredApps)
                Log.d(TAG, "Adapter existente atualizado com ${filteredApps.size} apps")
            }
            
            // Atualizar visibilidade com animação suave
            if (filteredApps.isEmpty()) {
                emptyLayout.visibility = View.VISIBLE
                appsRecyclerView.visibility = View.GONE
            } else {
                emptyLayout.visibility = View.GONE
                appsRecyclerView.visibility = View.VISIBLE
            }
        }
    }
    
    private fun getDeviceName(): String {
        val deviceName = if (customDeviceName.isNotEmpty()) {
            customDeviceName
        } else {
            "${Build.MANUFACTURER} ${Build.MODEL}"
        }
        Log.d(TAG, "📝 getDeviceName() chamado:")
        Log.d(TAG, "   customDeviceName: \"$customDeviceName\"")
        Log.d(TAG, "   deviceName final: \"$deviceName\"")
        return deviceName
    }
    
    
    private fun showDeviceNameDialog() {
        Log.d(TAG, "=== DEBUG: showDeviceNameDialog chamada ===")
        
        // Marcar interação do usuário
        markUserInteraction()
        
        // Mostrar menu de opções
        showOptionsMenu()
    }
    
    private fun showOptionsMenu() {
        val options = arrayOf("Mudar Nome do Dispositivo", "Chat com Suporte")
        
        val builder = android.app.AlertDialog.Builder(this)
        builder.setTitle("Opções do Dispositivo")
        builder.setItems(options) { _, which ->
            when (which) {
                0 -> {
                    // Mudar nome do dispositivo
                    if (adminPassword.isEmpty()) {
                        Log.d(TAG, "Senha de administrador vazia - configure via painel web")
                        Toast.makeText(this, "Configure a senha de administrador via painel web", Toast.LENGTH_LONG).show()
                        return@setItems
                    }
                    showPasswordDialog()
                }
                1 -> {
                    // Chat com suporte
                    showSupportChat()
                }
            }
        }
        builder.setNegativeButton("Cancelar", null)
        builder.show()
    }
    
    private fun showPasswordDialog() {
        val builder = android.app.AlertDialog.Builder(this)
        builder.setTitle("Autenticação de Administrador")
        builder.setMessage("Digite a senha de administrador para alterar o nome do dispositivo:")
        
        val input = android.widget.EditText(this)
        input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        input.hint = "Senha de administrador"
        input.setSingleLine(true)
        
        // Configurar padding para melhor aparência
        val padding = 40
        input.setPadding(padding, padding, padding, padding)
        
        builder.setView(input)
        
        builder.setPositiveButton("Continuar") { _, _ ->
            val enteredPassword = input.text.toString().trim()
            Log.d(TAG, "🔐 === VALIDAÇÃO DE SENHA ===")
            Log.d(TAG, "Senha digitada: '$enteredPassword'")
            Log.d(TAG, "Senha salva: '$adminPassword'")
            Log.d(TAG, "Senha digitada tamanho: ${enteredPassword.length}")
            Log.d(TAG, "Senha salva tamanho: ${adminPassword.length}")
            Log.d(TAG, "Senhas são iguais: ${enteredPassword == adminPassword}")
            Log.d(TAG, "Senha digitada hashCode: ${enteredPassword.hashCode()}")
            Log.d(TAG, "Senha salva hashCode: ${adminPassword.hashCode()}")
            Log.d(TAG, "Senha digitada bytes: ${enteredPassword.toByteArray().contentToString()}")
            Log.d(TAG, "Senha salva bytes: ${adminPassword.toByteArray().contentToString()}")
            Log.d(TAG, "Senha digitada trim: '${enteredPassword.trim()}'")
            Log.d(TAG, "Senha salva trim: '${adminPassword.trim()}'")
            Log.d(TAG, "Senhas são iguais após trim: ${enteredPassword.trim() == adminPassword.trim()}")
            Log.d(TAG, "============================")
            
            if (enteredPassword == adminPassword) {
                Log.d(TAG, "✅ Senha correta - abrindo diálogo de mudança de nome")
                showNameChangeDialog()
            } else {
                Log.w(TAG, "❌ Senha incorreta fornecida")
                Toast.makeText(this@MainActivity, "❌ Senha incorreta!", Toast.LENGTH_SHORT).show()
            }
        }
        
        builder.setNegativeButton("Cancelar", null)
        
        val dialog = builder.create()
        dialog.show()
        
        // Forçar foco e teclado após um delay maior para garantir que o EditText esteja "served"
        input.postDelayed({
            if (input.isFocusable) {
                input.requestFocus()
                val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                imm.showSoftInput(input, android.view.inputmethod.InputMethodManager.SHOW_FORCED)
            }
        }, 300)
    }
    
    private fun showNameChangeDialog() {
        val builder = android.app.AlertDialog.Builder(this)
        builder.setTitle("Nome do Dispositivo")
        builder.setMessage("Digite um nome personalizado para este dispositivo:")
        
        val input = android.widget.EditText(this)
        input.setText(customDeviceName)
        input.hint = "Ex: Dispositivo Sala 1"
        input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        input.setSingleLine(true)
        input.selectAll() // Selecionar todo o texto para facilitar edição
        
        // Configurar padding para melhor aparência
        val padding = 40
        input.setPadding(padding, padding, padding, padding)
        
        builder.setView(input)
        
        builder.setPositiveButton("Salvar") { _, _ ->
            val newName = input.text.toString().trim()
            if (newName.isNotEmpty()) {
                customDeviceName = newName
                saveData()
                markUserInteraction() // Interação significativa
                Toast.makeText(this@MainActivity, "✅ Nome alterado para: $newName", Toast.LENGTH_SHORT).show()
                Log.d(TAG, "Nome do dispositivo alterado para: $customDeviceName")
                
                // Atualizar dados do dispositivo se estiver conectado
                Log.d(TAG, "🔍 Verificando conexões WebSocket...")
                Log.d(TAG, "WebSocketService conectado: ${isServiceBound && (webSocketService?.isConnected() == true)}")
                
                if (isServiceBound && (webSocketService?.isConnected() == true)) {
                    scope.launch {
                        val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                        Log.d(TAG, "📤 Enviando nome atualizado via WebSocketService: ${deviceInfo.name}")
                        
                        // Enviar via método do service que adiciona o wrapper correto
                        webSocketService?.sendDeviceStatus(deviceInfo)
                        
                        Log.d(TAG, "✅ Nome atualizado enviado via WebSocketService!")
                    }
                } else {
                    Log.w(TAG, "⚠️ Nenhuma conexão WebSocket ativa - nome será enviado quando conectar")
                }
                
                Log.d(TAG, "Nome alterado para: $customDeviceName")
            }
        }
        
        builder.setNegativeButton("Cancelar", null)
        builder.setNeutralButton("Resetar") { _, _ ->
            customDeviceName = ""  // Limpar nome personalizado para usar o padrão
            saveData()
            markUserInteraction() // Interação significativa
            Toast.makeText(this@MainActivity, "✅ Nome resetado para padrão: ${getDeviceName()}", Toast.LENGTH_SHORT).show()
            Log.d(TAG, "Nome do dispositivo resetado para padrão: ${getDeviceName()}")
            
            // Atualizar dados do dispositivo se estiver conectado
            Log.d(TAG, "🔍 Verificando conexões WebSocket (reset)...")
            Log.d(TAG, "WebSocketService conectado: ${isServiceBound && (webSocketService?.isConnected() == true)}")
            
            if (isServiceBound && (webSocketService?.isConnected() == true)) {
                scope.launch {
                    val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                    Log.d(TAG, "📤 Enviando nome resetado via WebSocketService: ${deviceInfo.name}")
                    
                    // Enviar via método do service que adiciona o wrapper correto
                    webSocketService?.sendDeviceStatus(deviceInfo)
                    
                    Log.d(TAG, "✅ Nome resetado enviado via WebSocketService!")
                }
            } else {
                Log.w(TAG, "⚠️ Nenhuma conexão WebSocket ativa - nome será enviado quando conectar")
            }
        }
        
        val dialog = builder.create()
        dialog.show()
        
        // Forçar foco e teclado após um delay maior para garantir que o EditText esteja "served"
        input.postDelayed({
            if (input.isFocusable) {
                input.requestFocus()
                input.selectAll()
                val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                imm.showSoftInput(input, android.view.inputmethod.InputMethodManager.SHOW_FORCED)
            }
        }, 300)
    }
    
    private fun showSupportChat() {
        val builder = android.app.AlertDialog.Builder(this)
        builder.setTitle("Chat com Suporte")
        builder.setMessage("Digite sua mensagem de suporte:")
        
        // Criar ScrollView personalizado com altura máxima
        val displayMetrics = resources.displayMetrics
        val maxHeight = (displayMetrics.heightPixels * 0.4).toInt()
        
        val scrollView = object : android.widget.ScrollView(this) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
                val newHeightMeasureSpec = MeasureSpec.makeMeasureSpec(maxHeight, MeasureSpec.AT_MOST)
                super.onMeasure(widthMeasureSpec, newHeightMeasureSpec)
            }
        }
        
        val layoutParams = android.widget.LinearLayout.LayoutParams(
            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
        )
        scrollView.layoutParams = layoutParams
        
        val layout = android.widget.LinearLayout(this)
        layout.orientation = android.widget.LinearLayout.VERTICAL
        layout.setPadding(50, 8, 50, 20)
        
        val input = android.widget.EditText(this)
        input.setHint("Descreva o problema ou dúvida...")
        input.minLines = 3
        input.maxLines = Int.MAX_VALUE  // Permitir expansão ilimitada
        input.inputType = android.text.InputType.TYPE_CLASS_TEXT or 
                         android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                         android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        input.isVerticalScrollBarEnabled = true
        input.setVerticalScrollBarEnabled(true)
        
        // Limitar a 500 caracteres usando InputFilter
        val maxLengthFilter = android.text.InputFilter.LengthFilter(500)
        input.filters = arrayOf(maxLengthFilter)
        
        // Configurar padding para melhor aparência
        val inputPadding = 24
        input.setPadding(inputPadding, inputPadding, inputPadding, inputPadding)
        
        // Adicionar contador de caracteres
        val counter = android.widget.TextView(this)
        counter.text = "0/500 caracteres"
        counter.textSize = 12f
        counter.setTextColor(android.graphics.Color.GRAY)
        counter.setPadding(inputPadding, 8, inputPadding, 0)
        
        // Atualizar contador e altura conforme o usuário digita
        input.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val length = s?.length ?: 0
                counter.text = "$length/500 caracteres"
                
                // Mudar cor do contador baseado na quantidade de caracteres
                when {
                    length > 480 -> counter.setTextColor(android.graphics.Color.RED)
                    length > 400 -> counter.setTextColor(android.graphics.Color.rgb(255, 140, 0)) // Orange
                    else -> counter.setTextColor(android.graphics.Color.GRAY)
                }
                
                // Forçar redesenho do layout para ajustar altura
                input.post {
                    val lineCount = input.lineCount
                    val maxVisibleLines = 8
                    
                    if (lineCount <= maxVisibleLines) {
                        // Para textos menores, mostrar todas as linhas
                        input.maxLines = lineCount.coerceAtLeast(3)
                        input.isVerticalScrollBarEnabled = false
                    } else {
                        // Para textos maiores, fixar em maxVisibleLines e habilitar scroll
                        input.maxLines = maxVisibleLines
                        input.isVerticalScrollBarEnabled = true
                    }
                }
            }
        })
        
        layout.addView(input)
        layout.addView(counter)
        scrollView.addView(layout)
        builder.setView(scrollView)
        
        builder.setPositiveButton("Enviar") { _, _ ->
            val message = input.text.toString().trim()
            if (message.isNotEmpty()) {
                markUserInteraction() // Interação significativa
                Log.d(TAG, "=== DEBUG: Tentando enviar mensagem de suporte ===")
                Log.d(TAG, "webSocketClient é null? ${webSocketClient == null}")
                Log.d(TAG, "isServiceBound: $isServiceBound")
                Log.d(TAG, "webSocketService é null? ${webSocketService == null}")
                
                // Verificar se está conectado (via Service)
                val isConnected = (isServiceBound && webSocketService?.isConnected() == true)
                
                Log.d(TAG, "═══════════════════════════════════════")
                Log.d(TAG, "📨 ENVIANDO MENSAGEM DE SUPORTE")
                Log.d(TAG, "Service bound: $isServiceBound")
                Log.d(TAG, "Service connected: ${webSocketService?.isConnected()}")
                Log.d(TAG, "Está conectado? $isConnected")
                Log.d(TAG, "═══════════════════════════════════════")
                
                if (isConnected) {
                    Log.d(TAG, "✅ Enviando mensagem via WebSocket")
                    scope.launch {
                        sendSupportMessageToServer(message)
                    }
                    Toast.makeText(this, "✅ Mensagem enviada!", Toast.LENGTH_SHORT).show()
                } else {
                    Log.d(TAG, "⚠️ Não conectado - salvando localmente")
                    saveSupportMessageLocally(message)
                    Toast.makeText(this, "⚠️ Mensagem salva. Será enviada quando conectar.", Toast.LENGTH_LONG).show()
                }
            } else {
                Toast.makeText(this, "Digite uma mensagem válida", Toast.LENGTH_SHORT).show()
            }
        }
        
        builder.setNegativeButton("Cancelar", null)
        builder.show()
    }
    
    
    private fun callSupport() {
        val intent = Intent(Intent.ACTION_DIAL)
        intent.data = android.net.Uri.parse("tel:+5511999999999") // Número de suporte
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir discador", e)
            Toast.makeText(this, "Erro ao abrir discador", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun sendSupportEmail() {
        val intent = Intent(Intent.ACTION_SEND)
        intent.type = "message/rfc822"
        intent.putExtra(Intent.EXTRA_EMAIL, arrayOf("suporte@empresa.com"))
        intent.putExtra(Intent.EXTRA_SUBJECT, "Suporte MDM - ${getDeviceName()}")
        intent.putExtra(Intent.EXTRA_TEXT, "Dispositivo: ${getDeviceName()}\nModelo: ${Build.MODEL}\nAndroid: ${Build.VERSION.RELEASE}\n\nDescreva seu problema aqui...")
        
        try {
            startActivity(Intent.createChooser(intent, "Enviar email de suporte"))
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir cliente de email", e)
            Toast.makeText(this, "Nenhum cliente de email encontrado", Toast.LENGTH_SHORT).show()
        }
    }
    
    private suspend fun sendSupportMessageToServer(message: String) {
        try {
            Log.d(TAG, "═══════════════════════════════════════")
            Log.d(TAG, "📤 ENVIANDO MENSAGEM DE SUPORTE")
            Log.d(TAG, "═══════════════════════════════════════")
            
            val supportMessage = mapOf(
                "type" to "support_message",
                "deviceId" to com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this),
                "deviceName" to getDeviceName(),
                "message" to message,
                "timestamp" to System.currentTimeMillis(),
                "androidVersion" to Build.VERSION.RELEASE,
                "model" to Build.MODEL
            )
            
            Log.d(TAG, "Mensagem: $message")
            Log.d(TAG, "DeviceId: ${supportMessage["deviceId"]}")
            Log.d(TAG, "DeviceName: ${supportMessage["deviceName"]}")
            
            val gson = Gson()
            val jsonMessage = gson.toJson(supportMessage)
            
            // Tentar enviar via Service primeiro, depois Client
            var sent = false
            if (isServiceBound && webSocketService?.isConnected() == true) {
                Log.d(TAG, "📡 Enviando via WebSocketService")
                webSocketService?.sendMessage(jsonMessage)
                sent = true
            }
            
            if (sent) {
                Log.d(TAG, "✅ Mensagem de suporte enviada com sucesso!")
            } else {
                Log.e(TAG, "❌ Nenhuma conexão disponível para enviar")
            }
            Log.d(TAG, "═══════════════════════════════════════")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao enviar mensagem de suporte", e)
        }
    }
    
    private fun saveSupportMessageLocally(message: String) {
        val sharedPreferences = getSharedPreferences("mdm_support", Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        
        val timestamp = System.currentTimeMillis()
        val messageKey = "support_message_$timestamp"
        editor.putString(messageKey, message)
        editor.apply()
        
        Log.d(TAG, "Mensagem de suporte salva localmente: $message")
    }
    
    private fun launchApp(app: AppInfo) {
        try {
            val intent = packageManager.getLaunchIntentForPackage(app.packageName)
            if (intent != null) {
                // Adicionar flags para evitar que o launcher seja destruído
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY)
                
                // Manter o launcher vivo em background
                intent.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
                
                startActivity(intent)
                Log.d(TAG, "App ${app.appName} lançado com sucesso")
                Log.d(TAG, "Launcher mantido ativo em background")
            } else {
                Log.w(TAG, "Não foi possível abrir o app: ${app.packageName}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir app: ${app.packageName}", e)
        }
    }
    
    private fun showNotification(title: String, body: String) {
        Log.d(TAG, "=== INÍCIO showNotification ===")
        Log.d(TAG, "Título: $title")
        Log.d(TAG, "Corpo: $body")
        
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Verificar se as notificações estão habilitadas
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                if (!notificationManager.areNotificationsEnabled()) {
                    Log.w(TAG, "Notificações desabilitadas pelo usuário")
                    // Mostrar toast informativo
                    runOnUiThread {
                        Toast.makeText(this, "Notificações desabilitadas. Ative nas configurações.", Toast.LENGTH_LONG).show()
                    }
                    return
                }
            }
            
            // Criar canal de notificação se necessário (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                createNotificationChannel()
            }
            
            // Intent para abrir o app quando clicar na notificação
            // IMPORTANTE: Usar FLAG_ACTIVITY_SINGLE_TOP para não recriar Activity
            val intent = Intent(this, MainActivity::class.java).apply {
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
            
            // Criar notificação com mais detalhes
            val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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
            Log.d(TAG, "Notificação exibida com sucesso (ID: $notificationId)")
            
            // Mostrar toast de confirmação
            runOnUiThread {
                Toast.makeText(this, "Notificação recebida: $title", Toast.LENGTH_SHORT).show()
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao exibir notificação", e)
            // Mostrar toast de erro
            runOnUiThread {
                Toast.makeText(this, "Erro ao exibir notificação: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
        
        Log.d(TAG, "=== FIM showNotification ===")
    }
    
    private fun rebootDevice() {
        Log.d(TAG, "=== INÍCIO rebootDevice ===")
        
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            // Verificar se é Device Owner (necessário para reinicialização)
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                Log.d(TAG, "Device Owner confirmado - reiniciando dispositivo")
                
                // Mostrar notificação antes de reiniciar
                showNotification(
                    "MDM Launcher", 
                    "Dispositivo será reiniciado em 3 segundos..."
                )
                
                // Aguardar 3 segundos e reiniciar
                scope.launch {
                    delay(3000)
                    try {
                        devicePolicyManager.reboot(adminComponent)
                        Log.d(TAG, "Comando de reinicialização executado")
                    } catch (e: Exception) {
                        Log.e(TAG, "Erro ao executar reinicialização", e)
                        // Fallback: usar Runtime.exec
                        try {
                            Runtime.getRuntime().exec("su -c reboot")
                            Log.d(TAG, "Reinicialização via su executada")
                        } catch (e2: Exception) {
                            Log.e(TAG, "Erro no fallback de reinicialização", e2)
                        }
                    }
                }
                
            } else {
                Log.w(TAG, "Não é Device Owner - reinicialização pode não funcionar")
                
                // Tentar método alternativo
                try {
                    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                    powerManager.reboot(null)
                } catch (e: Exception) {
                    Log.e(TAG, "Erro na reinicialização alternativa", e)
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro geral na reinicialização", e)
        }
        
        Log.d(TAG, "=== FIM rebootDevice ===")
    }
    
    private fun lockDevice() {
        Log.d(TAG, "=== INÍCIO lockDevice ===")
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                // Bloquear tela imediatamente
                devicePolicyManager.lockNow()
                Log.d(TAG, "✅ Dispositivo bloqueado")
            } else {
                Log.w(TAG, "❌ Não é Device Owner - não pode bloquear dispositivo")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao bloquear dispositivo", e)
        }
        Log.d(TAG, "=== FIM lockDevice ===")
    }
    
    private fun wipeDevice(confirmCode: String?) {
        Log.d(TAG, "=== INÍCIO wipeDevice ===")
        Log.d(TAG, "Código de confirmação: $confirmCode")
        
        // Código de segurança para evitar wipe acidental
        val currentDeviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
        if (confirmCode != "CONFIRM_WIPE_${currentDeviceId.takeLast(8)}") {
            Log.e(TAG, "❌ Código de confirmação inválido - wipe cancelado por segurança")
            return
        }
        
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                Log.w(TAG, "⚠️ EXECUTANDO FACTORY RESET EM 5 SEGUNDOS...")
                
                showNotification(
                    "⚠️ ATENÇÃO",
                    "Dispositivo será resetado em 5 segundos! Todos os dados serão apagados!"
                )
                
                scope.launch {
                    delay(5000)
                    try {
                        // Factory reset completo
                        devicePolicyManager.wipeData(0)
                        Log.d(TAG, "Factory reset executado")
                    } catch (e: Exception) {
                        Log.e(TAG, "Erro ao executar factory reset", e)
                    }
                }
            } else {
                Log.e(TAG, "❌ Não é Device Owner - não pode fazer factory reset")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao executar wipe", e)
        }
        Log.d(TAG, "=== FIM wipeDevice ===")
    }
    
    private fun clearAppCache(packageName: String) {
        Log.d(TAG, "=== INÍCIO clearAppCache: $packageName ===")
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                // Limpar cache do app
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    devicePolicyManager.setApplicationHidden(adminComponent, packageName, true)
                    devicePolicyManager.setApplicationHidden(adminComponent, packageName, false)
                }
                Log.d(TAG, "✅ Cache do app $packageName limpo")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar cache do app", e)
        }
        Log.d(TAG, "=== FIM clearAppCache ===")
    }
    
    private fun setCameraDisabled(disabled: Boolean) {
        Log.d(TAG, "=== INÍCIO setCameraDisabled: $disabled ===")
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                devicePolicyManager.setCameraDisabled(adminComponent, disabled)
                Log.d(TAG, "✅ Câmera ${if (disabled) "desabilitada" else "habilitada"}")
                
                runOnUiThread {
                    Toast.makeText(this, 
                        "Câmera ${if (disabled) "desabilitada" else "habilitada"}", 
                        Toast.LENGTH_SHORT).show()
                }
            } else {
                Log.w(TAG, "❌ Não é Device Owner - não pode controlar câmera")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao controlar câmera", e)
        }
        Log.d(TAG, "=== FIM setCameraDisabled ===")
    }
    
    private fun uninstallApp(packageName: String) {
        Log.d(TAG, "=== INÍCIO uninstallApp: $packageName ===")
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            if (devicePolicyManager.isDeviceOwnerApp(this.packageName)) {
                // Desinstalar app silenciosamente (apenas com Device Owner)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    scope.launch {
                        try {
                            val intent = Intent(Intent.ACTION_DELETE)
                            intent.data = android.net.Uri.parse("package:$packageName")
                            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            startActivity(intent)
                            Log.d(TAG, "✅ Desinstalação de $packageName iniciada")
                        } catch (e: Exception) {
                            Log.e(TAG, "Erro ao desinstalar app", e)
                        }
                    }
                }
            } else {
                Log.w(TAG, "❌ Não é Device Owner - não pode desinstalar app silenciosamente")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desinstalar app", e)
        }
        Log.d(TAG, "=== FIM uninstallApp ===")
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        // Processar resultado através do PermissionManager
        permissionManager.onSpecialPermissionResult(requestCode)
        
        super.onActivityResult(requestCode, resultCode, data)
        
        when (requestCode) {
            REQUEST_CODE_ENABLE_ADMIN -> {
                if (resultCode == RESULT_OK) {
                    Log.d(TAG, "Device Admin habilitado")
                    // Tentar definir como launcher padrão após ativar Device Admin
                    setAsDefaultLauncher()
                } else {
                    Log.w(TAG, "Device Admin não foi habilitado")
                }
            }
            REQUEST_CODE_USAGE_STATS -> {
                if (isUsageStatsPermissionGranted()) {
                    Log.d(TAG, "Permissão de Usage Stats concedida")
                } else {
                    Log.w(TAG, "Permissão de Usage Stats não foi concedida")
                }
            }
        }
    }
    
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == 1001) {
            Log.d(TAG, "Permissões essenciais processadas")
            
            // Verificar se a permissão de notificação foi concedida
            val notificationPermissionIndex = permissions.indexOf(Manifest.permission.POST_NOTIFICATIONS)
            if (notificationPermissionIndex != -1) {
                if (grantResults[notificationPermissionIndex] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "Permissão de notificações concedida")
                    // Criar canal de notificação imediatamente
                    createNotificationChannel()
                } else {
                    Log.w(TAG, "Permissão de notificações negada")
                    runOnUiThread {
                        Toast.makeText(this, "Notificações negadas. Ative nas configurações para receber notificações do MDM.", Toast.LENGTH_LONG).show()
                    }
                }
            }
            
            onPermissionsComplete()
        }
        
        when (requestCode) {
            REQUEST_CODE_LOCATION -> {
                if (grantResults.isNotEmpty() && 
                    grantResults[0] == PackageManager.PERMISSION_GRANTED && 
                    grantResults[1] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "Permissões de localização concedidas")
                    initializeLocationTracking()
                } else {
                    Log.w(TAG, "Permissões de localização negadas")
                    runOnUiThread {
                        connectionStatusText.text = "Localização necessária para rastreamento"
                        connectionStatusText.setTextColor(resources.getColor(R.color.connection_disconnected, null))
                    }
                }
            }
            REQUEST_CODE_NOTIFICATIONS -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "Permissão de notificações concedida")
                    createNotificationChannel()
                } else {
                    Log.w(TAG, "Permissão de notificações negada")
                }
            }
        }
        
        // Verificar se ainda há permissões pendentes
        checkPermissions()
    }
    
    override fun onResume() {
        super.onResume()
        
        val currentTime = System.currentTimeMillis()
        val timeSinceLastResume = currentTime - lastResumeTime
        
        Log.d(TAG, "onResume() chamado - Activity retomada (${timeSinceLastResume}ms desde último resume)")
        
        // Evitar processamento desnecessário se a activity foi destruída
        if (isActivityDestroyed) {
            Log.w(TAG, "Activity foi destruída, ignorando onResume")
            return
        }
        
        // Tela desbloqueada - garantir conexão ativa
        handleScreenUnlocked()
        
        // SEMPRE recarregar allowedApps do SharedPreferences quando voltar ao foreground
        // Isso garante que mudanças feitas enquanto app estava em background sejam aplicadas
        val savedAllowedApps = sharedPreferences.getString("allowed_apps", null)
        if (savedAllowedApps != null) {
            try {
                val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
                val newAllowedApps = gson.fromJson<List<String>>(savedAllowedApps, type)
                
                // Só atualizar se mudou
                if (newAllowedApps != allowedApps) {
                    Log.d(TAG, "🔄 Detectada mudança em allowedApps no onResume!")
                    Log.d(TAG, "   ANTES: ${allowedApps.size} apps")
                    Log.d(TAG, "   DEPOIS: ${newAllowedApps.size} apps")
                    allowedApps = newAllowedApps
                    
                    // Forçar atualização da UI
                    if (installedApps.isNotEmpty()) {
                        updateAppsList()
                        Log.d(TAG, "✅ UI atualizada com novos apps permitidos")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao recarregar allowedApps no onResume", e)
            }
        }
        
        // Evitar processamento muito frequente (menos de 1 segundo)
        if (timeSinceLastResume < 1000) {
            Log.d(TAG, "onResume muito frequente, ignorando processamento adicional")
            return
        }
        
        // Detectar ciclo de pause/resume excessivo
        val timeSinceLastPause = currentTime - lastPauseTime
        if (pauseResumeCount > 5 && timeSinceLastPause < 2000) {
            Log.w(TAG, "Ciclo de pause/resume excessivo detectado ($pauseResumeCount ciclos), ignorando processamento")
            return
        }
        
        lastResumeTime = currentTime
        
        // Reset do contador se a activity ficou estável por mais de 5 segundos
        if (timeSinceLastResume > 5000) {
            pauseResumeCount = 0
            Log.d(TAG, "Activity estável, resetando contador de ciclos")
        }
        
        // Verificar se o app foi reinstalado e precisa verificar permissões imediatamente
        val sharedPreferences = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
        val forcePermissionCheck = sharedPreferences.getBoolean("force_permission_check", false)
        if (forcePermissionCheck) {
            Log.d(TAG, "🔄 REINSTALAÇÃO DETECTADA NO onResume - verificando permissões imediatamente")
            checkPermissions()
            return // Interromper processamento normal para focar nas permissões
        }
        
        // Marcar como interação significativa se foi um resume após pausa longa
        if (timeSinceLastResume > 10000) { // 10 segundos
            markUserInteraction()
        }
        
        // Garantir que a barra de navegação permaneça visível
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.show(android.view.WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = 0
        }
        
        // Verificar saúde da conexão WebSocket após inatividade
        checkWebSocketHealth()
        
        // Carregar apps apenas se necessário (cache inteligente)
        loadAppsIfNeeded()
    }
    
    override fun onPause() {
        super.onPause()
        lastPauseTime = System.currentTimeMillis()
        pauseResumeCount++
        Log.d(TAG, "onPause() chamado - Activity pausada (ciclo #$pauseResumeCount)")
        
        // Tela pode estar sendo bloqueada - verificar estado
        checkScreenState()
    }
    
    override fun onStop() {
        super.onStop()
        Log.d(TAG, "onStop() chamado - Activity parada")
        
        // Prevenir destruição desnecessária da activity
        if (!isFinishing && !isChangingConfigurations) {
            Log.w(TAG, "Activity sendo parada mas não finalizada - pode ser destruída desnecessariamente")
        }
    }
    
    override fun onRestart() {
        super.onRestart()
        Log.d(TAG, "onRestart() chamado - Activity reiniciada")
    }
    
    private fun loadAppsIfNeeded() {
        // Evitar carregamento duplo
        if (isLoadingApps) {
            Log.d(TAG, "Carregamento de apps já em andamento, ignorando")
            return
        }
        
        // Evitar processamento se a activity foi destruída
        if (isActivityDestroyed) {
            Log.w(TAG, "Activity foi destruída, ignorando carregamento de apps")
            return
        }
        
        val currentTime = System.currentTimeMillis()
        val shouldReload = installedApps.isEmpty() || 
                          (currentTime - lastAppUpdateTime) > APP_CACHE_DURATION
        
        if (shouldReload) {
            Log.d(TAG, "Carregando apps (cache expirado ou vazio)")
            isLoadingApps = true
            scope.launch {
                try {
                    loadingProgress.visibility = View.VISIBLE
                    val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                    installedApps = deviceInfo.installedApps
                    lastAppUpdateTime = currentTime
                    Log.d(TAG, "Apps instalados carregados: ${installedApps.size}")
                    Log.d(TAG, "Apps permitidos antes de updateAppsList: ${allowedApps.size}")
                    saveData()
                    updateAppsList()
                    loadingProgress.visibility = View.GONE
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao carregar apps instalados", e)
                    loadingProgress.visibility = View.GONE
                } finally {
                    isLoadingApps = false
                }
            }
        } else {
            Log.d(TAG, "Usando cache de apps (${installedApps.size} apps)")
            // Usar cache existente
            updateAppsList()
        }
        
        // Verificar status do launcher periodicamente (menos frequente)
        scope.launch {
            while (true) {
                delay(10 * 60 * 1000) // A cada 10 minutos
                checkDefaultLauncherStatus()
            }
        }
        
        // Enviar informações do dispositivo periodicamente
        startPeriodicDeviceInfoUpdates()
        
        // Verificar se há mensagem pendente para mostrar (apenas uma vez)
        Log.d(TAG, "Verificando mensagem pendente - lastNotificationMessage: '$lastNotificationMessage', isMessageModalVisible: $isMessageModalVisible, hasShownPendingMessage: $hasShownPendingMessage")
        if (lastNotificationMessage.isNotEmpty() && !isMessageModalVisible && !hasShownPendingMessage) {
            Log.d(TAG, "Exibindo modal de mensagem pendente")
            showMessageModal(lastNotificationMessage)
            hasShownPendingMessage = true
        } else {
            Log.d(TAG, "Modal não será exibido - condições não atendidas")
        }
    }
    
    private fun startPeriodicDeviceInfoUpdates() {
        scope.launch {
            var lastSentInfo: String? = null
            
            while (true) {
                delay(60000) // Aumentado para 60 segundos - menos frequente
                
                try {
                    val currentTime = System.currentTimeMillis()
                    val timeSinceLastInteraction = currentTime - this@MainActivity.lastInteractionTime
                    
                    // Só enviar se:
                    // 1. Houve interação recente (últimos 5 minutos) OU
                    // 2. Passou muito tempo sem enviar (10 minutos) para manter conexão viva
                    val shouldSend = timeSinceLastInteraction < 300000 || // 5 minutos
                                   (lastSentInfo == null) || // Primeira vez
                                   (currentTime - (lastSentInfo?.toLongOrNull() ?: 0L)) > 600000 // 10 minutos
                    
                    if (!shouldSend) {
                        Log.d(TAG, "Pulando envio de informações - sem interação recente")
                        continue
                    }
                    
                    // Coletar informações do dispositivo
                    val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                    val deviceInfoJson = gson.toJson(deviceInfo)
                    
                    // Verificar se houve mudanças significativas
                    if (deviceInfoJson == lastSentInfo) {
                        Log.d(TAG, "Informações do dispositivo não mudaram, pulando envio")
                        continue
                    }
                    
                    // Tentar enviar via serviço primeiro
                    if (isServiceBound && webSocketService?.isConnected() == true) {
                        webSocketService?.sendMessage(deviceInfoJson)
                        Log.d(TAG, "Informações do dispositivo enviadas via WebSocketService (mudança detectada)")
                        lastSentInfo = currentTime.toString()
                    } 
                    // Tentar via cliente local
                    else if (webSocketClient?.isConnected() == true) {
                        webSocketClient?.sendDeviceStatus(deviceInfo)
                        Log.d(TAG, "Informações do dispositivo enviadas via WebSocketClient local (mudança detectada)")
                        lastSentInfo = currentTime.toString()
                    }
                    else {
                        Log.d(TAG, "Nenhuma conexão ativa - aguardando conexão para enviar informações")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao enviar informações condicionais", e)
                }
            }
        }
    }
    
    // Função para marcar que houve interação do usuário
    private fun markUserInteraction() {
        lastInteractionTime = System.currentTimeMillis()
        Log.d(TAG, "Interação do usuário detectada - próximo sync será enviado")
        
        // Enviar informações imediatamente quando há interação
        scope.launch {
            try {
                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                
                if (isServiceBound && webSocketService?.isConnected() == true) {
                    webSocketService?.sendDeviceStatus(deviceInfo)
                    Log.d(TAG, "Informações enviadas imediatamente após interação (WebSocketService)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar informações após interação", e)
            }
        }
    }
    
    private fun checkWebSocketHealth() {
        Log.d(TAG, "=== Verificando saúde da conexão WebSocket ===")
        
        // Verificar se o WebSocket client existe e está saudável
        val client = webSocketClient
        if (client == null) {
            Log.w(TAG, "WebSocket client é null, tentando reconectar...")
            setupWebSocketClient()
            return
        }
        
        // Verificar saúde da conexão
        val isHealthy = client.checkConnectionHealth()
        if (!isHealthy) {
            Log.w(TAG, "Conexão WebSocket não está saudável")
            // A função checkConnectionHealth já tenta reconectar automaticamente
        } else {
            Log.d(TAG, "Conexão WebSocket está saudável")
        }
        
        // Verificar se o serviço WebSocket está rodando
        if (!isServiceBound) {
            Log.w(TAG, "Serviço WebSocket não está conectado, tentando reconectar...")
            startWebSocketService()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy() chamado - Activity destruída")
        
        // Verificar se a destruição é necessária
        if (!isFinishing && !isChangingConfigurations) {
            Log.e(TAG, "ERRO: Activity sendo destruída desnecessariamente! Isso pode causar travamento ao voltar para o launcher")
        }
        
        isActivityDestroyed = true
        stopLocationTracking()
        stopNetworkMonitoring()
        stopPeriodicSync()
        
        // Parar NetworkMonitor
        networkMonitor?.destroy()
        networkMonitor = null
        
        // Desregistrar BroadcastReceiver
        try {
            unregisterReceiver(serviceMessageReceiver)
            Log.d(TAG, "✅ BroadcastReceiver desregistrado")
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao desregistrar BroadcastReceiver (pode já estar desregistrado)", e)
        }
        
        // Desconectar do serviço
        if (isServiceBound) {
            unbindService(serviceConnection)
            isServiceBound = false
        }
        
        // WebSocketClient removido - usando apenas WebSocketService
        scope.cancel()
        
        // Limpar modal de mensagem
        messageModal?.let { modal ->
            val rootLayout = findViewById<ViewGroup>(android.R.id.content)
            rootLayout.removeView(modal)
        }
        messageModal = null
    }
    
    private fun stopNetworkMonitoring() {
        networkCallback?.let { callback ->
            connectivityManager?.unregisterNetworkCallback(callback)
        }
        networkCallback = null
    }
    
    private fun setKioskMode(packageName: String, enabled: Boolean) {
        Log.d(TAG, "=== INÍCIO setKioskMode ===")
        Log.d(TAG, "packageName: $packageName")
        Log.d(TAG, "enabled: $enabled")
        
        try {
            if (enabled) {
                // Ativar Lock Task Mode como Scalefusion
                Log.d(TAG, "Ativando Lock Task Mode para: $packageName")
                
                // Verificar se o app está instalado
                try {
                    val packageInfo = packageManager.getPackageInfo(packageName, 0)
                    Log.d(TAG, "App encontrado: ${packageInfo.packageName}")
                } catch (e: Exception) {
                    Log.e(TAG, "App não encontrado: $packageName", e)
                    Log.w(TAG, "App não encontrado: $packageName")
                    return
                }
                
                // Salvar app de quiosque
                val prefs = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
                prefs.edit().putString("kiosk_app", packageName).apply()
                Log.d(TAG, "App salvo no SharedPreferences")
                
                // Verificar se somos Device Owner
                if (isDeviceOwner()) {
                    Log.d(TAG, "Device Owner confirmado - usando Lock Task Mode")
                    
                    val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    val adminComponent = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
                    
                    // Configurar apenas o app de quiosque como permitido no Lock Task
                    devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(packageName))
                    Log.d(TAG, "App configurado como lock task package")
                    
                    // Iniciar o app
                    val intent = packageManager.getLaunchIntentForPackage(packageName)
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        
                        Log.d(TAG, "Iniciando app: $packageName")
                        startActivity(intent)
                        
                        // ATIVAR LOCK TASK MODE - igual Scalefusion
                        Log.d(TAG, "Ativando Lock Task Mode...")
                        startLockTask()
                        Log.d(TAG, "Lock Task Mode ativado - app travado!")
                        
                        Log.d(TAG, "App $packageName travado na tela!")
                        return
                    }
                } else {
                    Log.w(TAG, "Não é Device Owner - Lock Task Mode pode não funcionar")
                    
                    // Tentar mesmo assim
                    val intent = packageManager.getLaunchIntentForPackage(packageName)
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        
                        Log.d(TAG, "Tentando Lock Task Mode sem Device Owner")
                        startActivity(intent)
                        
                        try {
                            startLockTask()
                            Log.d(TAG, "Lock Task Mode ativado (sem Device Owner)")
                            
                            Log.d(TAG, "App $packageName travado na tela!")
                        } catch (e: Exception) {
                            Log.e(TAG, "Erro ao ativar Lock Task Mode", e)
                            Log.w(TAG, "Erro: Precisa ser Device Owner para travar app")
                        }
                    }
                }
            } else {
                // Desativar Lock Task Mode
                Log.d(TAG, "Desativando Lock Task Mode")
                
                try {
                    stopLockTask()
                    Log.d(TAG, "Lock Task Mode desativado")
                } catch (e: Exception) {
                    Log.d(TAG, "Erro ao desativar Lock Task Mode", e)
                }
                
                // Restaurar configurações se Device Owner
                if (isDeviceOwner()) {
                    try {
                        val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                        val adminComponent = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
                        
                        // Limpar lock task packages
                        devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf())
                        Log.d(TAG, "Lock task packages limpos")
                    } catch (e: Exception) {
                        Log.e(TAG, "Erro ao limpar lock task packages", e)
                    }
                }
                
                val prefs = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
                prefs.edit().remove("kiosk_app").apply()
                Log.d(TAG, "App removido do SharedPreferences")
                
                // Voltar para o launcher MDM
                val intent = Intent(this, MainActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                Log.d(TAG, "Voltando para MainActivity")
                startActivity(intent)
                
                Log.d(TAG, "App destravado")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao configurar Lock Task Mode", e)
            Log.e(TAG, "Erro ao configurar Lock Task Mode: ${e.message}")
        }
        
        Log.d(TAG, "=== FIM setKioskMode ===")
    }
    
    private fun isDeviceOwner(): Boolean {
        return try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val adminComponent = android.content.ComponentName(this, com.mdm.launcher.DeviceAdminReceiver::class.java)
            devicePolicyManager.isDeviceOwnerApp(packageName)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar Device Owner", e)
            false
        }
    }
    
    override fun onBackPressed() {
        // Verificar se estamos em Lock Task Mode
        val prefs = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
        val kioskApp = prefs.getString("kiosk_app", null)
        
        if (kioskApp != null) {
            // Em Lock Task Mode, o botão voltar é bloqueado automaticamente
            // Mas vamos tentar manter o app ativo se ele sair
            Log.d(TAG, "Lock Task Mode ativo - tentando manter app $kioskApp")
            try {
                val intent = packageManager.getLaunchIntentForPackage(kioskApp)
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    startActivity(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao tentar manter app em Lock Task Mode", e)
            }
        } else {
            // Comportamento de launcher: ignorar botão voltar
            Log.d(TAG, "Botão voltar pressionado - ignorado")
            // Não fazer nada - o botão voltar é desabilitado
        }
    }
    
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        
        // Verificar se estamos em Lock Task Mode e manter o app ativo
        val prefs = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
        val kioskApp = prefs.getString("kiosk_app", null)
        
        if (kioskApp != null && hasFocus) {
            Log.d(TAG, "App perdeu foco em Lock Task Mode - tentando restaurar")
            try {
                val intent = packageManager.getLaunchIntentForPackage(kioskApp)
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    startActivity(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao tentar restaurar app em Lock Task Mode", e)
            }
        }
    }
    
    /**
     * Envia dados do dispositivo via WebSocket
     */
    private fun syncDeviceInfo() {
        scope.launch {
            try {
                // Sempre coletar informações completas do dispositivo
                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                
                Log.d(TAG, "=== DADOS COLETADOS DO DISPOSITIVO (PERIÓDICO) ===")
                Log.d(TAG, "Bateria: ${deviceInfo.batteryLevel}%")
                Log.d(TAG, "Apps instalados: ${deviceInfo.installedAppsCount}")
                Log.d(TAG, "Apps permitidos: ${deviceInfo.allowedApps.size}")
                Log.d(TAG, "Armazenamento total: ${deviceInfo.storageTotal / (1024*1024*1024)}GB")
                Log.d(TAG, "Armazenamento usado: ${deviceInfo.storageUsed / (1024*1024*1024)}GB")
                Log.d(TAG, "Serial: ${deviceInfo.serialNumber}")
                Log.d(TAG, "IMEI: ${deviceInfo.imei}")
                Log.d(TAG, "==================================================")
                
                // Verificar se os dados são válidos
                if (deviceInfo.batteryLevel == 0 && deviceInfo.installedAppsCount == 0 && deviceInfo.storageTotal == 0L) {
                    Log.e(TAG, "⚠️ DADOS ZERADOS DETECTADOS! Problema na coleta de dados.")
                } else {
                    Log.d(TAG, "✓ Dados coletados com sucesso")
                }
                
                installedApps = deviceInfo.installedApps
                lastAppUpdateTime = System.currentTimeMillis()
                saveData()
                updateAppsList()
                
                // Enviar status completo do dispositivo
                webSocketClient?.sendDeviceStatus(deviceInfo)
                
                Log.d(TAG, "Informações do dispositivo enviadas periodicamente: ${deviceInfo.installedApps.size} apps")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao coletar informações do dispositivo", e)
            }
        }
    }
    
    /**
     * Inicia o timer periódico para enviar dados do dispositivo a cada 30 segundos
     */
    private fun startPeriodicSync() {
        Log.d(TAG, "Iniciando sincronização periódica a cada 30 segundos")
        
        // Parar timer anterior se existir
        stopPeriodicSync()
        
        periodicSyncRunnable = object : Runnable {
            override fun run() {
                Log.d(TAG, "Timer periódico executado - enviando dados do dispositivo")
                
                // Verificar se WebSocket está conectado
                if (webSocketClient?.isConnected() == true) {
                    // Enviar dados do dispositivo
                    syncDeviceInfo()
                } else {
                    Log.w(TAG, "WebSocket não conectado, pulando envio periódico")
                }
                
                // Agendar próxima execução em 30 segundos
                handler.postDelayed(this, 30000)
            }
        }
        
        // Iniciar timer
        handler.postDelayed(periodicSyncRunnable!!, 30000)
    }
    
    /**
     * Para o timer periódico
     */
    private fun stopPeriodicSync() {
        Log.d(TAG, "Parando sincronização periódica")
        periodicSyncRunnable?.let { runnable ->
            handler.removeCallbacks(runnable)
            periodicSyncRunnable = null
        }
    }
    
    /**
     * Mostra dialog para remover Device Owner (DEBUG)
     */
    private fun showRemoveDeviceOwnerDialog() {
        val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(packageName)
        
        if (!isDeviceOwner) {
            Toast.makeText(this, "Não é Device Owner", Toast.LENGTH_SHORT).show()
            return
        }
        
        val builder = android.app.AlertDialog.Builder(this)
        builder.setTitle("⚠️ Remover Device Owner")
        builder.setMessage("ATENÇÃO: Isso removerá as permissões de Device Owner do app.\n\nO app poderá ser desinstalado normalmente após isso.\n\nContinuar?")
        
        builder.setPositiveButton("SIM, REMOVER") { dialog, _ ->
            removeDeviceOwner()
            dialog.dismiss()
        }
        
        builder.setNegativeButton("Cancelar") { dialog, _ ->
            dialog.dismiss()
        }
        
        builder.show()
    }
    
    /**
     * Remove Device Owner e limpa o app
     */
    private fun removeDeviceOwner() {
        try {
            val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            
            Log.d(TAG, "🗑️ Tentando remover Device Owner...")
            
            // Verificar se é Device Owner
            if (!devicePolicyManager.isDeviceOwnerApp(packageName)) {
                Toast.makeText(this, "Não é Device Owner", Toast.LENGTH_SHORT).show()
                return
            }
            
            // Limpar Device Owner
            devicePolicyManager.clearDeviceOwnerApp(packageName)
            
            Log.d(TAG, "✅ Device Owner removido com sucesso!")
            
            Toast.makeText(this, "✅ Device Owner removido!\n\nVocê pode desinstalar o app agora.", Toast.LENGTH_LONG).show()
            
            // Limpar dados do app
            val prefs = getSharedPreferences("mdm_launcher", MODE_PRIVATE)
            prefs.edit().clear().apply()
            
            // Mostrar mensagem final
            val builder = android.app.AlertDialog.Builder(this)
            builder.setTitle("✅ Sucesso!")
            builder.setMessage("Device Owner removido com sucesso!\n\nO app pode ser desinstalado normalmente agora.\n\nDeseja abrir as configurações para desinstalar?")
            builder.setPositiveButton("Sim") { _, _ ->
                try {
                    val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    intent.data = android.net.Uri.parse("package:$packageName")
                    startActivity(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao abrir configurações", e)
                }
            }
            builder.setNegativeButton("Depois") { dialog, _ ->
                dialog.dismiss()
                finish()
            }
            builder.setCancelable(false)
            builder.show()
            
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ Erro de segurança ao remover Device Owner", e)
            Toast.makeText(this, "❌ Erro: Não foi possível remover Device Owner", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao remover Device Owner", e)
            Toast.makeText(this, "❌ Erro: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
    
    // ==================== CONTROLE DE ESTADO DA TELA ====================
    
    private fun setupScreenStateMonitoring() {
        Log.d(TAG, "🔧 Configurando monitoramento de estado da tela...")
        
        try {
            // Configurar WakeLock para manter CPU ativa quando necessário
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "MDMLauncher::ScreenStateWakeLock"
            )
            
            // Registrar receiver para mudanças de estado da tela
            screenStateReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    when (intent?.action) {
                        Intent.ACTION_SCREEN_ON -> {
                            Log.d(TAG, "📱 TELA LIGADA - garantindo conexão ativa")
                            handleScreenUnlocked()
                        }
                        Intent.ACTION_SCREEN_OFF -> {
                            Log.d(TAG, "📱 TELA DESLIGADA - ajustando conexão")
                            handleScreenLocked()
                        }
                        Intent.ACTION_USER_PRESENT -> {
                            Log.d(TAG, "📱 USUÁRIO PRESENTE - reconectando imediatamente")
                            handleScreenUnlocked()
                        }
                    }
                }
            }
            
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_USER_PRESENT)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(screenStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(screenStateReceiver, filter)
            }
            
            Log.d(TAG, "✅ Monitoramento de estado da tela configurado")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao configurar monitoramento de tela", e)
        }
    }
    
    private fun cleanupScreenStateMonitoring() {
        try {
            screenStateReceiver?.let { receiver ->
                unregisterReceiver(receiver)
                Log.d(TAG, "✅ Receiver de estado da tela removido")
            }
            
            wakeLock?.let { lock ->
                if (lock.isHeld) {
                    lock.release()
                    Log.d(TAG, "✅ WakeLock liberado")
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao limpar monitoramento de tela", e)
        }
    }
    
    private fun handleScreenUnlocked() {
        val currentTime = System.currentTimeMillis()
        val timeSinceLastChange = currentTime - lastScreenStateChange
        
        // Evitar processamento muito frequente
        if (timeSinceLastChange < 1000) {
            Log.d(TAG, "Mudança de estado muito recente, ignorando")
            return
        }
        
        lastScreenStateChange = currentTime
        isScreenLocked = false
        
        Log.d(TAG, "🔓 TELA DESBLOQUEADA - ativando conexão persistente")
        
        // Ativar WakeLock para manter conexão ativa
        wakeLock?.let { lock ->
            if (!lock.isHeld) {
                lock.acquire(10 * 60 * 1000L) // 10 minutos
                Log.d(TAG, "🔋 WakeLock ativado para manter conexão")
            }
        }
        
        // Verificar e garantir conexão WebSocket ativa
        scope.launch {
            try {
                // Aguardar um pouco para garantir que a tela esteja estável
                delay(500)
                
                // Verificar conexão do WebSocketService
                if (isServiceBound && webSocketService?.isConnected() == true) {
                    Log.d(TAG, "✅ WebSocketService já conectado")
                    
                    // Notificar que tela está ativa
                    webSocketService?.setScreenActive(true)
                    
                    // Enviar ping imediato para confirmar conexão
                    webSocketService?.sendMessage("""{"type":"ping","timestamp":${System.currentTimeMillis()}}""")
                    Log.d(TAG, "📤 Ping enviado para confirmar conexão")
                    
                } else {
                    Log.w(TAG, "⚠️ WebSocketService não conectado, tentando reconectar...")
                    startWebSocketService()
                    
                    // Aguardar conexão
                    delay(2000)
                    
                    if (webSocketService?.isConnected() == true) {
                        Log.d(TAG, "✅ WebSocketService reconectado com sucesso")
                        webSocketService?.setScreenActive(true)
                    } else {
                        Log.w(TAG, "⚠️ Falha ao reconectar WebSocketService")
                    }
                }
                
                // Verificar conexão do WebSocketClient local
                webSocketClient?.let { client ->
                    if (!client.isConnected()) {
                        Log.w(TAG, "⚠️ WebSocketClient local desconectado, reconectando...")
                        client.forceReconnect()
                    } else {
                        Log.d(TAG, "✅ WebSocketClient local conectado")
                    }
                    
                    // Notificar que a tela está ativa para heartbeat mais frequente
                    client.setScreenActive(true)
                }
                
                // Enviar status do dispositivo imediatamente
                sendDeviceStatusImmediately()
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao processar desbloqueio da tela", e)
            }
        }
    }
    
    private fun handleScreenLocked() {
        val currentTime = System.currentTimeMillis()
        val timeSinceLastChange = currentTime - lastScreenStateChange
        
        // Evitar processamento muito frequente
        if (timeSinceLastChange < 1000) {
            Log.d(TAG, "Mudança de estado muito recente, ignorando")
            return
        }
        
        lastScreenStateChange = currentTime
        isScreenLocked = true
        
        Log.d(TAG, "🔒 TELA BLOQUEADA - ajustando conexão para modo economia")
        
        // Liberar WakeLock para economizar bateria
        wakeLock?.let { lock ->
            if (lock.isHeld) {
                lock.release()
                Log.d(TAG, "🔋 WakeLock liberado para economizar bateria")
            }
        }
        
        // Manter conexão básica mas reduzir frequência de heartbeat
        scope.launch {
            try {
                // Enviar status final antes de reduzir atividade
                sendDeviceStatusImmediately()
                
                // Notificar WebSocketService e WebSocketClient que tela está inativa
                webSocketService?.setScreenActive(false)
                webSocketClient?.setScreenActive(false)
                
                Log.d(TAG, "📱 Modo economia ativado - conexão mantida mas com heartbeat reduzido")
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao processar bloqueio da tela", e)
            }
        }
    }
    
    private fun checkScreenState() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val isScreenOn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
                powerManager.isInteractive
            } else {
                @Suppress("DEPRECATION")
                powerManager.isScreenOn
            }
            
            val wasLocked = isScreenLocked
            isScreenLocked = !isScreenOn
            
            if (wasLocked != isScreenLocked) {
                Log.d(TAG, "📱 Estado da tela mudou: ${if (isScreenLocked) "BLOQUEADA" else "DESBLOQUEADA"}")
                
                if (!isScreenLocked) {
                    handleScreenUnlocked()
                } else {
                    handleScreenLocked()
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao verificar estado da tela", e)
        }
    }
    
    private fun sendDeviceStatusImmediately() {
        scope.launch {
            try {
                Log.d(TAG, "📤 Enviando status do dispositivo imediatamente...")
                
                val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                
                // Enviar via WebSocketService se disponível
                if (isServiceBound && webSocketService?.isConnected() == true) {
                    webSocketService?.sendDeviceStatus(deviceInfo)
                    Log.d(TAG, "✅ Status enviado via WebSocketService")
                } else {
                    // Fallback para WebSocketClient local
                    webSocketClient?.sendDeviceStatus(deviceInfo)
                    Log.d(TAG, "✅ Status enviado via WebSocketClient local")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao enviar status imediatamente", e)
            }
        }
    }
}
