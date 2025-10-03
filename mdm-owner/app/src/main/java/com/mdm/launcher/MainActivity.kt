package com.mdm.launcher

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
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
import com.mdm.launcher.ui.AppAdapter
import com.mdm.launcher.utils.DeviceInfoCollector
import com.mdm.launcher.utils.LocationHistoryManager
import com.mdm.launcher.utils.GeofenceManager
import com.mdm.launcher.utils.GeofenceEvent
import com.mdm.launcher.utils.PermissionManager
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
    
    // Serviço WebSocket em background
    private var webSocketService: WebSocketService? = null
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
    
    // Modal de mensagem
    private var messageModal: View? = null
    private var isMessageModalVisible = false
    private var lastNotificationMessage: String = ""
    private var lastNotificationTimestamp: Long = 0L
    private var hasShownPendingMessage = false
    
    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_CODE_ENABLE_ADMIN = 1001
        private const val REQUEST_CODE_USAGE_STATS = 1002
        private const val REQUEST_CODE_LOCATION = 1003
        private const val REQUEST_CODE_NOTIFICATIONS = 1004
        private const val LOCATION_UPDATE_INTERVAL = 15000L // 15 segundos - mais frequente
        private const val LOCATION_UPDATE_DISTANCE = 5f // 5 metros - mais preciso
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
        startWebSocketService()
        setupWebSocketClient()
        
        // Carregar dados salvos
        loadSavedData()
        
        // Verificar se somos o launcher padrão
        checkDefaultLauncherStatus()
        
        // Verificar se deve mostrar modal de mensagem (vindo de notificação)
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
        Log.d(TAG, "Dados salvos: ${allowedApps.size} apps permitidos, nome: $customDeviceName, senha: ${if (adminPassword.isNotEmpty()) "***" else "não definida"}")
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
        Log.d(TAG, "=== DEBUG: Carregando senha de administrador ===")
        Log.d(TAG, "Valor do SharedPreferences: ${sharedPreferences.getString("admin_password", "null")}")
        Log.d(TAG, "Senha de administrador carregada: ${if (adminPassword.isNotEmpty()) "***" else "não definida"}")
        Log.d(TAG, "Tamanho da senha: ${adminPassword.length}")
        
        // Não carregar apps instalados salvos pois contêm Drawable que não pode ser serializado
        // Os apps instalados serão coletados novamente no onResume()
        Log.d(TAG, "Apps instalados serão coletados novamente no onResume()")
        
        // Atualizar a interface com os dados carregados (sempre, mesmo se lista estiver vazia)
        updateAppsList()
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
        
        // Evitar solicitações de permissão muito frequentes
        if (permissionRequestCount > 3 && (currentTime - lastPermissionRequestTime) < 30000) {
            Log.w(TAG, "Muitas solicitações de permissão recentes ($permissionRequestCount), aguardando 30s")
            return
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
                    // Verificar se a localização é válida e mais precisa que a anterior
                    if (location.accuracy > 0 && (lastKnownLocation == null || 
                        location.accuracy < lastKnownLocation!!.accuracy || 
                        location.time > lastKnownLocation!!.time)) {
                        
                        lastKnownLocation = location
                        isLocationTrackingEnabled = true
                        
                        // Enviar localização via WebSocket
                        sendLocationUpdate(location)
                        
                        Log.d(TAG, "Localização atualizada: ${location.latitude}, ${location.longitude} (precisão: ${location.accuracy}m)")
                    } else {
                        Log.d(TAG, "Localização ignorada - menos precisa que a anterior")
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
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        
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
        } else if (webSocketClient?.isConnected() == true) {
            webSocketClient?.sendMessage(jsonMessage)
            Log.d(TAG, "Localização enviada via WebSocketClient local")
        } else {
            Log.w(TAG, "WebSocket não conectado, localização não enviada")
        }
    }
    
    private fun sendGeofenceEvent(event: GeofenceEvent) {
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
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
        } else if (webSocketClient?.isConnected() == true) {
            webSocketClient?.sendMessage(jsonMessage)
            Log.d(TAG, "Evento de geofencing enviado via WebSocketClient local")
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
                    connectionStatusText.text = "Launcher MDM ativo como padrão"
                    connectionStatusText.setTextColor(resources.getColor(R.color.connection_connected, null))
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
    
    private fun setupWebSocketClient() {
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val serverUrl = "ws://10.0.2.2:3002" // IP do emulador para localhost
        
        Log.d(TAG, "=== CONFIGURAÇÃO WEBSOCKET ===")
        Log.d(TAG, "DeviceId obtido: ${deviceId?.takeLast(4) ?: "null"}")
        Log.d(TAG, "Server URL: $serverUrl")
        Log.d(TAG, "Service bound: $isServiceBound")
        Log.d(TAG, "=============================")
        
        // Verificar se deviceId é válido
        if (deviceId.isNullOrEmpty()) {
            Log.e(TAG, "❌ DeviceId é null ou vazio! Tentando obter novamente...")
            val retryDeviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            if (retryDeviceId.isNullOrEmpty()) {
                Log.e(TAG, "❌ Falha ao obter DeviceId - usando fallback persistente")
                // Usar um ID persistente baseado no modelo (sem timestamp)
                val persistentId = getPersistentDeviceId()
                Log.w(TAG, "⚠️ Usando DeviceId persistente: ${persistentId.takeLast(4)}")
                setupWebSocketWithId(persistentId, serverUrl)
            } else {
                Log.d(TAG, "✅ DeviceId obtido na segunda tentativa: ${retryDeviceId.takeLast(4)}")
                setupWebSocketWithId(retryDeviceId, serverUrl)
            }
        } else {
            Log.d(TAG, "✅ DeviceId válido: ${deviceId.takeLast(4)}")
            setupWebSocketWithId(deviceId, serverUrl)
        }
    }
    
    private fun getPersistentDeviceId(): String {
        // Gerar um ID persistente baseado em características que não mudam
        val model = Build.MODEL.replace(" ", "_")
        val brand = Build.BRAND.replace(" ", "_")
        val device = Build.DEVICE.replace(" ", "_")
        val hardware = Build.HARDWARE.replace(" ", "_")
        
        // Combinar características estáveis para criar um ID único e persistente
        val stableId = "${brand}_${model}_${device}_${hardware}".hashCode().toString()
        
        Log.d(TAG, "=== GERANDO DEVICE ID PERSISTENTE ===")
        Log.d(TAG, "Brand: $brand")
        Log.d(TAG, "Modelo: $model")
        Log.d(TAG, "Device: $device")
        Log.d(TAG, "Hardware: $hardware")
        Log.d(TAG, "ID Persistente: ${stableId.takeLast(4)}")
        Log.d(TAG, "===================================")
        
        return stableId
    }
    
    private fun setupWebSocketWithId(deviceId: String, serverUrl: String) {
        // Se o serviço estiver disponível, usar ele; senão, criar cliente local
        if (isServiceBound && webSocketService != null) {
            Log.d(TAG, "Usando WebSocketService para comunicação")
            // O serviço já está gerenciando a conexão WebSocket
        } else {
            Log.d(TAG, "Usando WebSocketClient singleton como fallback")
            webSocketClient = WebSocketClient.getInstance(
                serverUrl = serverUrl,
                deviceId = deviceId,
                onMessage = { message -> handleWebSocketMessage(message) },
                onConnectionChange = { connected -> updateConnectionStatus(connected) }
            )
            
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
                
                // Enviar status completo do dispositivo
                webSocketClient?.sendDeviceStatus(deviceInfo)
                
                Log.d(TAG, "Informações do dispositivo enviadas: ${deviceInfo.installedApps.size} apps")
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
                    Log.d(TAG, "=== DEBUG: update_app_permissions recebido ===")
                    val data = jsonObject["data"] as? Map<*, *>
                    Log.d(TAG, "Data recebida: $data")
                    val allowedAppsList = data?.get("allowedApps") as? List<*>
                    Log.d(TAG, "Apps permitidos recebidos: $allowedAppsList")
                    allowedApps = allowedAppsList?.map { it.toString() } ?: emptyList()
                    Log.d(TAG, "Apps permitidos processados: ${allowedApps.size} apps")
                    Log.d(TAG, "Lista de apps permitidos: $allowedApps")
                    saveData() // Salvar dados recebidos da web
                    markUserInteraction() // Marcar como interação significativa
                    updateAppsList()
                    Log.d(TAG, "Apps list atualizada no launcher")
                }
                "set_admin_password" -> {
                    Log.d(TAG, "=== DEBUG: set_admin_password recebido ===")
                    Log.d(TAG, "Mensagem completa: $message")
                    val data = jsonObject["data"] as? Map<*, *>
                    Log.d(TAG, "Data extraída: $data")
                    val password = data?.get("password") as? String
                    Log.d(TAG, "Password extraída: $password")
                    if (password != null) {
                        adminPassword = password
                        saveData()
                        Log.d(TAG, "Senha de administrador definida via WebSocket: $password")
                        Log.d(TAG, "Senha salva no SharedPreferences")
                    } else {
                        Log.e(TAG, "ERRO: Password é null na mensagem set_admin_password")
                    }
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
                    } else if (webSocketClient?.isConnected() == true) {
                        webSocketClient?.sendMessage(gson.toJson(confirmationMessage))
                        Log.d(TAG, "Confirmação de notificação enviada via WebSocketClient")
                    }
                }
                "reboot_device" -> {
                    // Reiniciar dispositivo
                    Log.d(TAG, "Comando de reinicialização recebido")
                    rebootDevice()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem WebSocket", e)
        }
    }
    
    private fun updateConnectionStatus(connected: Boolean) {
        runOnUiThread {
            if (connected) {
                connectionStatusText.text = "Conectado"
                connectionStatusText.setTextColor(resources.getColor(R.color.connection_connected, null))
                // Resetar tentativas de reconexão quando conectar
                webSocketClient?.resetReconnectAttempts()
                Log.d(TAG, "Status de conexão: CONECTADO")
            } else {
                connectionStatusText.text = "Reconectando..."
                connectionStatusText.setTextColor(resources.getColor(R.color.connection_disconnected, null))
                Log.d(TAG, "Status de conexão: DESCONECTADO - tentando reconectar")
                
                // Forçar reconexão apenas se necessário
                if (!isServiceBound || webSocketService?.isConnected() != true) {
                    Log.d(TAG, "Tentando reconectar WebSocket")
                    webSocketClient?.connect()
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
                connectionStatusText.visibility = View.VISIBLE
            } else {
                emptyLayout.visibility = View.GONE
                appsRecyclerView.visibility = View.VISIBLE
                connectionStatusText.visibility = View.GONE
            }
        }
    }
    
    private fun getDeviceName(): String {
        return if (customDeviceName.isNotEmpty()) {
            customDeviceName
        } else {
            "${Build.MANUFACTURER} ${Build.MODEL}"
        }
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
            if (enteredPassword == adminPassword) {
                showNameChangeDialog()
            } else {
                Log.w(TAG, "Senha incorreta fornecida")
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
                Log.d(TAG, "Nome do dispositivo alterado para: $customDeviceName")
                
                // Atualizar dados do dispositivo se estiver conectado
                webSocketClient?.let { client ->
                    scope.launch {
                        val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                        client.sendDeviceStatus(deviceInfo)
                    }
                }
                
                Log.d(TAG, "Nome alterado para: $customDeviceName")
            }
        }
        
        builder.setNegativeButton("Cancelar", null)
        builder.setNeutralButton("Resetar") { _, _ ->
            customDeviceName = ""  // Limpar nome personalizado para usar o padrão
            saveData()
            markUserInteraction() // Interação significativa
            Log.d(TAG, "Nome do dispositivo resetado para padrão: ${getDeviceName()}")
            
            // Atualizar dados do dispositivo se estiver conectado
            webSocketClient?.let { client ->
                scope.launch {
                    val deviceInfo = DeviceInfoCollector.collectDeviceInfo(this@MainActivity, getDeviceName())
                    client.sendDeviceStatus(deviceInfo)
                }
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
                
                // Enviar mensagem via WebSocket se conectado
                if (webSocketClient != null) {
                    Log.d(TAG, "Enviando via webSocketClient")
                    scope.launch {
                        sendSupportMessageToServer(message)
                    }
                    Toast.makeText(this, "Mensagem enviada com sucesso!", Toast.LENGTH_SHORT).show()
                } else {
                    Log.d(TAG, "webSocketClient é null, salvando localmente")
                    // Salvar mensagem localmente se não conectado
                    saveSupportMessageLocally(message)
                    Toast.makeText(this, "Mensagem salva localmente. Será enviada quando conectado.", Toast.LENGTH_LONG).show()
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
            Log.d(TAG, "=== DEBUG: sendSupportMessageToServer iniciada ===")
            Log.d(TAG, "webSocketClient é null? ${webSocketClient == null}")
            
            val supportMessage = mapOf(
                "type" to "support_message",
                "deviceId" to Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID),
                "deviceName" to getDeviceName(),
                "message" to message,
                "timestamp" to System.currentTimeMillis(),
                "androidVersion" to Build.VERSION.RELEASE,
                "model" to Build.MODEL
            )
            
            Log.d(TAG, "Mensagem criada: $supportMessage")
            
            val gson = Gson()
            val jsonMessage = gson.toJson(supportMessage)
            Log.d(TAG, "JSON criado: $jsonMessage")
            
            if (webSocketClient != null) {
                webSocketClient?.sendMessage(jsonMessage)
                Log.d(TAG, "Mensagem enviada via WebSocket: $message")
            } else {
                Log.e(TAG, "webSocketClient é null, não foi possível enviar")
            }
            
            Log.d(TAG, "Mensagem de suporte enviada: $message")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar mensagem de suporte", e)
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
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                putExtra("show_message_modal", true)
                putExtra("message_content", body)
            }
            
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
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
        
        // Evitar processamento muito frequente (menos de 1 segundo)
        if (timeSinceLastResume < 1000) {
            Log.d(TAG, "onResume muito frequente, ignorando processamento")
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
                    webSocketService?.sendMessage(gson.toJson(deviceInfo))
                    Log.d(TAG, "Informações enviadas imediatamente após interação (WebSocketService)")
                } else if (webSocketClient?.isConnected() == true) {
                    webSocketClient?.sendDeviceStatus(deviceInfo)
                    Log.d(TAG, "Informações enviadas imediatamente após interação (WebSocketClient)")
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
        
        // Desconectar do serviço
        if (isServiceBound) {
            unbindService(serviceConnection)
            isServiceBound = false
        }
        
        // Desconectar cliente local se existir e limpar singleton
        webSocketClient?.disconnect()
        webSocketClient = null
        WebSocketClient.destroyInstance()
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
}
