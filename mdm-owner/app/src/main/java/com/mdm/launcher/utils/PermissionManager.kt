package com.mdm.launcher.utils

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionManager(private val activity: Activity) {
    
    companion object {
        private const val TAG = "PermissionManager"
        
        // Permissões essenciais apenas para funcionamento da web
        private val ESSENTIAL_PERMISSIONS = arrayOf(
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        // Permissões para Android 6.0+ (Runtime permissions) - apenas essenciais
        private val RUNTIME_PERMISSIONS = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        // Permissões especiais que precisam de configurações
        private val SPECIAL_PERMISSIONS = arrayOf(
            Manifest.permission.SYSTEM_ALERT_WINDOW,
            Manifest.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
        )
        
        const val PERMISSION_REQUEST_CODE = 1001
        const val USAGE_STATS_REQUEST_CODE = 1002
        const val SYSTEM_ALERT_WINDOW_REQUEST_CODE = 1003
        const val BATTERY_OPTIMIZATION_REQUEST_CODE = 1004
    }
    
    private var currentPermissionIndex = 0
    private var onAllPermissionsGranted: (() -> Unit)? = null
    
    /**
     * Inicia o processo de solicitação de permissões em sequência
     */
    fun requestAllPermissions(onComplete: () -> Unit) {
        onAllPermissionsGranted = onComplete
        currentPermissionIndex = 0
        
        Log.d(TAG, "Iniciando solicitação de permissões em sequência")
        requestNextPermission()
    }
    
    /**
     * Solicita apenas as permissões selecionadas pelo usuário
     */
    fun requestSelectedPermissions(selectedPermissions: List<String>, onComplete: () -> Unit) {
        onAllPermissionsGranted = onComplete
        
        Log.d(TAG, "Solicitando permissões selecionadas: $selectedPermissions")
        
        // Filtrar apenas permissões de runtime
        val runtimePermissions = selectedPermissions.filter { permission ->
            RUNTIME_PERMISSIONS.contains(permission)
        }
        
        if (runtimePermissions.isNotEmpty()) {
            // Solicitar todas as permissões de runtime de uma vez
            ActivityCompat.requestPermissions(
                activity,
                runtimePermissions.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        } else {
            // Não há permissões de runtime para solicitar
            Log.d(TAG, "Nenhuma permissão de runtime selecionada")
            onComplete()
        }
    }
    
    /**
     * Solicita a próxima permissão na sequência
     */
    private fun requestNextPermission() {
        if (currentPermissionIndex >= ESSENTIAL_PERMISSIONS.size) {
            // Todas as permissões foram solicitadas
            Log.d(TAG, "Todas as permissões foram solicitadas")
            requestSpecialPermissions()
            return
        }
        
        val permission = ESSENTIAL_PERMISSIONS[currentPermissionIndex]
        
        // Verificar se a permissão já foi concedida
        if (isPermissionGranted(permission)) {
            Log.d(TAG, "Permissão já concedida: $permission")
            currentPermissionIndex++
            requestNextPermission()
            return
        }
        
        // Verificar se é uma permissão de runtime (Android 6.0+)
        if (RUNTIME_PERMISSIONS.contains(permission) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Log.d(TAG, "Solicitando permissão de runtime: $permission")
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(permission),
                PERMISSION_REQUEST_CODE + currentPermissionIndex
            )
        } else {
            // Permissão não precisa de runtime request
            Log.d(TAG, "Permissão não requer runtime request: $permission")
            currentPermissionIndex++
            requestNextPermission()
        }
    }
    
    /**
     * Solicita permissões especiais que requerem configurações
     */
    private fun requestSpecialPermissions() {
        Log.d(TAG, "Solicitando permissões especiais")
        
        // Solicitar permissão de Usage Stats
        if (!isUsageStatsPermissionGranted()) {
            requestUsageStatsPermission()
        } else {
            // Solicitar permissão de System Alert Window
            if (!isSystemAlertWindowPermissionGranted()) {
                requestSystemAlertWindowPermission()
            } else {
                // Solicitar permissão de Battery Optimization
                if (!isBatteryOptimizationPermissionGranted()) {
                    requestBatteryOptimizationPermission()
                } else {
                    // Todas as permissões foram solicitadas
                    Log.d(TAG, "Todas as permissões foram solicitadas com sucesso")
                    onAllPermissionsGranted?.invoke()
                }
            }
        }
    }
    
    /**
     * Solicita permissão de Usage Stats
     */
    private fun requestUsageStatsPermission() {
        Log.d(TAG, "Solicitando permissão de Usage Stats")
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        activity.startActivityForResult(intent, USAGE_STATS_REQUEST_CODE)
    }
    
    /**
     * Solicita permissão de System Alert Window
     */
    private fun requestSystemAlertWindowPermission() {
        Log.d(TAG, "Solicitando permissão de System Alert Window")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            intent.data = Uri.parse("package:${activity.packageName}")
            activity.startActivityForResult(intent, SYSTEM_ALERT_WINDOW_REQUEST_CODE)
        }
    }
    
    /**
     * Solicita permissão de Battery Optimization
     */
    private fun requestBatteryOptimizationPermission() {
        Log.d(TAG, "Solicitando permissão de Battery Optimization")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            intent.data = Uri.parse("package:${activity.packageName}")
            activity.startActivityForResult(intent, BATTERY_OPTIMIZATION_REQUEST_CODE)
        }
    }
    
    /**
     * Verifica se uma permissão foi concedida
     */
    fun isPermissionGranted(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
    }
    
    /**
     * Verifica se a permissão de Usage Stats foi concedida
     */
    fun isUsageStatsPermissionGranted(): Boolean {
        val appOpsManager = activity.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        val mode = appOpsManager.checkOpNoThrow(
            "android:get_usage_stats",
            android.os.Process.myUid(),
            activity.packageName
        )
        return mode == android.app.AppOpsManager.MODE_ALLOWED
    }
    
    /**
     * Verifica se a permissão de System Alert Window foi concedida
     */
    fun isSystemAlertWindowPermissionGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(activity)
        } else {
            true
        }
    }
    
    /**
     * Verifica se a permissão de Battery Optimization foi concedida
     */
    fun isBatteryOptimizationPermissionGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = activity.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            powerManager.isIgnoringBatteryOptimizations(activity.packageName)
        } else {
            true
        }
    }
    
    /**
     * Processa resultado de solicitação de permissão
     */
    fun onPermissionResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        Log.d(TAG, "Resultado de permissão: requestCode=$requestCode, permissions=${permissions.size}, grantResults=${grantResults.size}")
        
        // Verificar se os arrays não estão vazios
        if (permissions.isNotEmpty() && grantResults.isNotEmpty()) {
            val granted = grantResults[0] == PackageManager.PERMISSION_GRANTED
            Log.d(TAG, "Resultado de permissão: granted=$granted")
            
            if (granted) {
                Log.d(TAG, "Permissão concedida: ${permissions[0]}")
            } else {
                Log.w(TAG, "Permissão negada: ${permissions[0]}")
            }
        } else {
            Log.w(TAG, "Arrays de permissão vazios - continuando")
        }
        
        // Se foi uma solicitação de permissões selecionadas, finalizar
        if (requestCode == PERMISSION_REQUEST_CODE) {
            Log.d(TAG, "Permissões selecionadas foram processadas")
            onAllPermissionsGranted?.invoke()
        } else {
            // Continuar para próxima permissão na sequência
            currentPermissionIndex++
            requestNextPermission()
        }
    }
    
    /**
     * Processa resultado de solicitação de permissão especial
     */
    fun onSpecialPermissionResult(requestCode: Int) {
        when (requestCode) {
            USAGE_STATS_REQUEST_CODE -> {
                Log.d(TAG, "Resultado de Usage Stats: ${isUsageStatsPermissionGranted()}")
                if (isUsageStatsPermissionGranted()) {
                    requestSystemAlertWindowPermission()
                } else {
                    // Continuar mesmo sem a permissão
                    requestSystemAlertWindowPermission()
                }
            }
            SYSTEM_ALERT_WINDOW_REQUEST_CODE -> {
                Log.d(TAG, "Resultado de System Alert Window: ${isSystemAlertWindowPermissionGranted()}")
                if (isSystemAlertWindowPermissionGranted()) {
                    requestBatteryOptimizationPermission()
                } else {
                    // Continuar mesmo sem a permissão
                    requestBatteryOptimizationPermission()
                }
            }
            BATTERY_OPTIMIZATION_REQUEST_CODE -> {
                Log.d(TAG, "Resultado de Battery Optimization: ${isBatteryOptimizationPermissionGranted()}")
                // Todas as permissões foram solicitadas
                onAllPermissionsGranted?.invoke()
            }
        }
    }
    
    /**
     * Verifica se todas as permissões essenciais foram concedidas
     */
    fun areAllEssentialPermissionsGranted(): Boolean {
        return ESSENTIAL_PERMISSIONS.all { permission ->
            if (RUNTIME_PERMISSIONS.contains(permission)) {
                isPermissionGranted(permission)
            } else {
                true // Permissões que não requerem runtime request
            }
        }
    }
    
    /**
     * Obtém lista de permissões pendentes
     */
    fun getPendingPermissions(): List<String> {
        return ESSENTIAL_PERMISSIONS.filter { permission ->
            if (RUNTIME_PERMISSIONS.contains(permission)) {
                !isPermissionGranted(permission)
            } else {
                false
            }
        }
    }
}
