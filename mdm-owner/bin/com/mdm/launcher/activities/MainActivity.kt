package com.mdm.launcher.activities

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.mdm.launcher.R
import com.mdm.launcher.data.AppInfo
import com.mdm.launcher.service.WebSocketService
import com.mdm.launcher.ui.AppAdapter
import com.mdm.launcher.ui.ConfigDialogFragment
import com.mdm.launcher.utils.AppMonitor
import com.mdm.launcher.utils.MessageManager
import com.mdm.launcher.utils.SetupManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "MainActivity"
        private const val MIN_RESUME_INTERVAL_MS = 2000L
        private const val MIN_LAUNCHER_CHECK_INTERVAL_MS = 5000L
    }
    
    private var messageReceiver: BroadcastReceiver? = null
    private lateinit var appsRecyclerView: RecyclerView
    private lateinit var emptyLayout: View
    private lateinit var configButton: FloatingActionButton
    private lateinit var notificationBadge: TextView
    private lateinit var loadingProgress: ProgressBar
    private lateinit var appAdapter: AppAdapter
    private var loadAppsJob: Job? = null
    private lateinit var setupManager: SetupManager
    
    private var lastResumeTime = 0L
    private var lastLauncherCheckTime = 0L
    private var isInitializing = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (isInitializing) return
        isInitializing = true
        
        try {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
            setupManager = SetupManager(this)
            
            if (!setupManager.isSetupCompleted() || !setupManager.isLauncherSelected()) {
                startActivity(Intent(this, PermissionsActivity::class.java).apply { addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION) })
                finish()
                return
            }
            
            setContentView(R.layout.activity_main)
            initializeViews()
            initializeApp()
            handleIntent(intent)
        } finally {
            isInitializing = false
        }
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }
    
    private fun handleIntent(intent: Intent?) {
        if (intent?.getBooleanExtra("show_message_modal", false) == true) {
            ConfigDialogFragment().apply {
                arguments = Bundle().apply { putBoolean("open_history", true) }
            }.show(supportFragmentManager, "ConfigDialog")
        }
    }
    
    private fun initializeApp() {
        setupRecyclerView()
        setupConfigButton()
        loadAndDisplayApps()
        startWebSocketService()
        registerBroadcastReceivers()
        loadingProgress.visibility = View.GONE
        
        // Iniciar monitoramento de uso
        AppMonitor.start(this)
    }
    
    private fun initializeViews() {
        appsRecyclerView = findViewById(R.id.apps_recycler_view)
        emptyLayout = findViewById(R.id.empty_layout)
        configButton = findViewById(R.id.config_button)
        notificationBadge = findViewById(R.id.notification_badge)
        loadingProgress = findViewById(R.id.loading_progress)
        
        updateNotificationBadge()
    }

    private fun updateNotificationBadge() {
        val unreadCount = MessageManager.getUnreadCount(this)
        if (unreadCount > 0) {
            notificationBadge.text = if (unreadCount > 9) "9+" else unreadCount.toString()
            notificationBadge.visibility = View.VISIBLE
        } else {
            notificationBadge.visibility = View.GONE
        }
    }
    
    private fun setupRecyclerView() {
        appAdapter = AppAdapter(emptyList()) { launchApp(it) }
        appsRecyclerView.layoutManager = GridLayoutManager(this, 4)
        appsRecyclerView.adapter = appAdapter
    }
    
    private fun setupConfigButton() {
        configButton.setOnClickListener { ConfigDialogFragment().show(supportFragmentManager, "ConfigDialog") }
    }
    
    private fun loadAndDisplayApps() {
        loadAppsJob?.cancel()
        loadingProgress.visibility = View.VISIBLE
        loadAppsJob = lifecycleScope.launch {
            try {
                val allowed = withContext(Dispatchers.IO) { loadAllowedApps() }
                if (!isActive) return@launch
                val installed = withContext(Dispatchers.IO) { getInstalledApps(allowed) }
                if (!isActive) return@launch
                
                loadingProgress.visibility = View.GONE
                if (installed.isEmpty()) {
                    appsRecyclerView.visibility = View.GONE
                    emptyLayout.visibility = View.VISIBLE
                } else {
                    appsRecyclerView.visibility = View.VISIBLE
                    emptyLayout.visibility = View.GONE
                    appAdapter.updateApps(installed)
                }
            } catch (e: Exception) {
                loadingProgress.visibility = View.GONE
                emptyLayout.visibility = View.VISIBLE
            }
        }
    }
    
    private fun loadAllowedApps(): List<String> {
        val saved = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE).getString("allowed_apps", null)
        return if (!saved.isNullOrEmpty()) Gson().fromJson(saved, object : TypeToken<List<String>>() {}.type) else emptyList()
    }
    
    private fun getInstalledApps(allowed: List<String>): List<AppInfo> {
        val apps = mutableListOf<AppInfo>()
        packageManager.getInstalledPackages(0).forEach { pkg ->
            try {
                val launchIntent = packageManager.getLaunchIntentForPackage(pkg.packageName)
                if (launchIntent != null && pkg.applicationInfo.enabled && allowed.contains(pkg.packageName)) {
                    apps.add(AppInfo(
                        packageName = pkg.packageName,
                        appName = pkg.applicationInfo.loadLabel(packageManager).toString(),
                        icon = pkg.applicationInfo.loadIcon(packageManager),
                        isSystemApp = (pkg.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0,
                        isEnabled = pkg.applicationInfo.enabled,
                        isAllowed = true
                    ))
                }
            } catch (e: Exception) {
                Log.w(TAG, "Erro ao carregar metadados do app ${pkg.packageName}: ${e.message}")
            }
        }
        return apps
    }
    
    private fun launchApp(app: AppInfo) {
        packageManager.getLaunchIntentForPackage(app.packageName)?.let {
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            startActivity(it)
        }
    }
    
    override fun onResume() {
        super.onResume()
        val now = System.currentTimeMillis()
        if (now - lastResumeTime < MIN_RESUME_INTERVAL_MS) return
        lastResumeTime = now
        
        // Verificar se permissões ainda são válidas
        if (!setupManager.isSetupCompleted() || !setupManager.isLauncherSelected()) {
            startActivity(Intent(this, PermissionsActivity::class.java).apply { addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION) })
            finish()
            return
        }

        if (setupManager.isSetupCompleted()) {
            if (now - lastLauncherCheckTime > MIN_LAUNCHER_CHECK_INTERVAL_MS) {
                lastLauncherCheckTime = now
                lifecycleScope.launch { delay(500); if (isActive) setupManager.ensureDefaultLauncher() }
            }
            loadAndDisplayApps()
            updateNotificationBadge()
        }
    }
    
    private fun startWebSocketService() {
        val intent = Intent(this, WebSocketService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
        
        // Iniciar serviço de localização também
        val locIntent = Intent(this, com.mdm.launcher.service.LocationService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(locIntent) else startService(locIntent)
    }
    
    private fun registerBroadcastReceivers() {
        messageReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    "com.mdm.launcher.UPDATE_APP_PERMISSIONS" -> loadAndDisplayApps()
                    "com.mdm.launcher.MESSAGE_RECEIVED" -> updateNotificationBadge()
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction("com.mdm.launcher.UPDATE_APP_PERMISSIONS")
            addAction("com.mdm.launcher.MESSAGE_RECEIVED")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(messageReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else registerReceiver(messageReceiver, filter)
    }
    
    override fun onDestroy() {
        loadAppsJob?.cancel()
        try { messageReceiver?.let { unregisterReceiver(it) } } catch (e: Exception) {}
        super.onDestroy()
    }
}
