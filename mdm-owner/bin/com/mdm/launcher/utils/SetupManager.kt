package com.mdm.launcher.utils

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SetupManager(private val activity: Activity) {
    
    companion object {
        private const val TAG = "SetupManager"
        private const val PREF_SETUP_COMPLETED = "setup_completed"
        private const val PREF_LAUNCHER_SELECTED = "launcher_selected"
        private const val REQUEST_CODE_LAUNCHER = 2001
        private const val REQUEST_CODE_NOTIFICATIONS = 2006
        private const val REQUEST_CODE_BATTERY_OPT = 2005
        private const val REQUEST_CODE_LOCATION = 2007
        private const val REQUEST_CODE_USAGE_STATS = 2008
    }
    
    private val prefs = activity.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
    
    private fun getScope(): CoroutineScope {
        return if (activity is AppCompatActivity) activity.lifecycleScope else CoroutineScope(Dispatchers.Main)
    }
    
    fun isDeviceOwner(): Boolean {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(activity.packageName)
    }
    
    fun setSetupCompleted(completed: Boolean) {
        prefs.edit().putBoolean(PREF_SETUP_COMPLETED, completed).apply()
    }

    fun isSetupCompleted(): Boolean {
        val isComplete = prefs.getBoolean(PREF_SETUP_COMPLETED, false)
        if (isComplete) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
                prefs.edit().putBoolean(PREF_SETUP_COMPLETED, false).apply()
                return false
            }
            if (!hasLocationPermission()) {
                prefs.edit().putBoolean(PREF_SETUP_COMPLETED, false).apply()
                return false
            }
            if (!hasUsageStatsPermission()) {
                prefs.edit().putBoolean(PREF_SETUP_COMPLETED, false).apply()
                return false
            }
        }
        return isComplete
    }
    
    fun isLauncherSelected(): Boolean {
        val isDefault = isDefaultLauncher()
        if (isSetupCompleted()) {
            val wasSelected = prefs.getBoolean(PREF_LAUNCHER_SELECTED, false)
            if (isDefault && !wasSelected) prefs.edit().putBoolean(PREF_LAUNCHER_SELECTED, true).apply()
            return wasSelected || isDefault
        }
        return false
    }
    
    fun isDefaultLauncher(): Boolean {
        val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME) }
        val resolveInfo: ResolveInfo? = activity.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return resolveInfo?.activityInfo?.packageName == activity.packageName
    }
    
    fun requestLauncherSelection() {
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) {
            getScope().launch(Dispatchers.Main) { requestLauncherSelection() }
            return
        }
        try {
            val settingsIntent = Intent(Settings.ACTION_HOME_SETTINGS).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
            activity.startActivityForResult(settingsIntent, REQUEST_CODE_LAUNCHER)
        } catch (e: Exception) {
            try {
                val homeIntent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME) }
                val chooserIntent = Intent.createChooser(homeIntent, "Escolha o launcher padrão").apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                activity.startActivityForResult(chooserIntent, REQUEST_CODE_LAUNCHER)
            } catch (e2: Exception) {
                Log.e(TAG, "Erro ao abrir configurações de launcher", e2)
            }
        }
    }
    
    fun ensureDefaultLauncher() {
        try {
            val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(activity.packageName) || isDefaultLauncher()) return
            
            if (prefs.getBoolean(PREF_LAUNCHER_SELECTED, false)) {
                val lastAttemptTime = prefs.getLong("last_launcher_set_attempt", 0)
                val currentTime = System.currentTimeMillis()
                if (currentTime - lastAttemptTime < 10000) return
                
                prefs.edit().putLong("last_launcher_set_attempt", currentTime).apply()
                trySetDefaultLauncherProgrammatically()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao garantir launcher padrão: ${e.message}")
        }
    }
    
    private fun trySetDefaultLauncherProgrammatically(): Boolean {
        return try {
            val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(activity, com.mdm.launcher.receivers.DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(activity.packageName)) return false
            
            val homeIntentFilter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            val launcherComponent = ComponentName(activity, com.mdm.launcher.activities.MainActivity::class.java)
            dpm.addPersistentPreferredActivity(componentName, homeIntentFilter, launcherComponent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao definir launcher padrão programaticamente: ${e.message}")
            false
        }
    }
    
    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        when (requestCode) {
            REQUEST_CODE_LAUNCHER -> {
                getScope().launch(Dispatchers.Main) {
                    delay(1000)
                    if (isDefaultLauncher() || isDeviceOwner()) {
                        if (isDeviceOwner() && !isDefaultLauncher()) trySetDefaultLauncherProgrammatically()
                        if (isDefaultLauncher()) prefs.edit().putBoolean(PREF_LAUNCHER_SELECTED, true).apply()
                    }
                }
            }
            REQUEST_CODE_BATTERY_OPT -> {
                if (hasBatteryOptimizationPermission()) Log.d(TAG, "✅ Permissão de Battery Optimization concedida!")
            }
        }
    }
    
    fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == REQUEST_CODE_NOTIFICATIONS) {
            if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                Log.d(TAG, "✅ Permissão de notificações concedida!")
            }
        } else if (requestCode == REQUEST_CODE_LOCATION) {
            if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                Log.d(TAG, "✅ Permissão de localização concedida!")
            }
        }
    }
    
    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permission = android.Manifest.permission.POST_NOTIFICATIONS
            if (ContextCompat.checkSelfPermission(activity, permission) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(activity, arrayOf(permission), REQUEST_CODE_NOTIFICATIONS)
            }
        }
    }
    
    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(activity, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
    }

    fun hasLocationPermission(): Boolean {
        val hasFine = ContextCompat.checkSelfPermission(activity, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(activity, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        
        return hasFine || hasCoarse
    }

    fun hasUsageStatsPermission(): Boolean {
        val appOps = activity.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), activity.packageName)
        } else {
            appOps.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), activity.packageName)
        }
        return mode == android.app.AppOpsManager.MODE_ALLOWED
    }

    fun requestUsageStatsPermission() {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivityForResult(intent, REQUEST_CODE_USAGE_STATS)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de estatísticas de uso", e)
        }
    }

    fun requestLocationPermission() {
        val permissions = arrayOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        ActivityCompat.requestPermissions(activity, permissions, REQUEST_CODE_LOCATION)
    }
    
    fun hasBatteryOptimizationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            (activity.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager).isIgnoringBatteryOptimizations(activity.packageName)
        } else true
    }
    
    fun requestBatteryOptimizationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivityForResult(intent, REQUEST_CODE_BATTERY_OPT)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao solicitar Battery Optimization", e)
            }
        }
    }
}
