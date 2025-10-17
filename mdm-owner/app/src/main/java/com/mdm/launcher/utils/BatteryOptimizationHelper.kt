package com.mdm.launcher.utils

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Helper para gerenciar otimizações de bateria
 * 
 * Garante que o app possa manter conexão permanente com o servidor
 * mesmo com Doze mode e otimizações de bateria ativas
 */
object BatteryOptimizationHelper {
    
    private const val TAG = "BatteryOptimization"
    
    /**
     * Verifica se o app está na whitelist de otimização de bateria
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true // Versões antigas não têm Doze mode
        }
    }
    
    /**
     * Solicita ao usuário que adicione o app à whitelist
     */
    @SuppressLint("BatteryLife")
    fun requestIgnoreBatteryOptimizations(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                if (!isIgnoringBatteryOptimizations(activity)) {
                    Log.d(TAG, "Solicitando exclusão da otimização de bateria...")
                    
                    // Usar packageName da activity explicitamente
                    val packageName = activity.packageName
                    Log.d(TAG, "PackageName: $packageName")
                    
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    intent.data = Uri.parse("package:$packageName")
                    
                    Log.d(TAG, "URI criada: ${intent.data}")
                    activity.startActivity(intent)
                    Log.d(TAG, "Intent de otimização de bateria enviado")
                } else {
                    Log.d(TAG, "✅ App já está na whitelist de otimização de bateria")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao solicitar exclusão de otimização de bateria", e)
                
                // Fallback: abrir configurações gerais de bateria
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    activity.startActivity(intent)
                } catch (e2: Exception) {
                    Log.e(TAG, "Erro ao abrir configurações de bateria", e2)
                }
            }
        }
    }
    
    /**
     * Abre as configurações de otimização de bateria
     */
    fun openBatteryOptimizationSettings(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
                Log.d(TAG, "Configurações de otimização de bateria abertas")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de otimização de bateria", e)
        }
    }
    
    /**
     * Obtém informações detalhadas sobre otimização de bateria
     */
    fun getBatteryOptimizationInfo(context: Context): Map<String, Any> {
        val info = mutableMapOf<String, Any>()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            
            info["is_ignoring_optimizations"] = powerManager.isIgnoringBatteryOptimizations(context.packageName)
            info["is_device_idle_mode"] = powerManager.isDeviceIdleMode
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                info["is_interactive"] = powerManager.isInteractive
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info["is_power_save_mode"] = powerManager.isPowerSaveMode
            }
        } else {
            info["is_ignoring_optimizations"] = true
            info["doze_not_supported"] = true
        }
        
        return info
    }
    
    /**
     * Solicita permissão de Schedule Exact Alarm (Android 12+)
     * Necessário para WorkManager funcionar precisamente
     */
    fun requestScheduleExactAlarmPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val alarmManager = activity.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
                
                if (!alarmManager.canScheduleExactAlarms()) {
                    Log.d(TAG, "Solicitando permissão de Schedule Exact Alarm...")
                    
                    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                        data = Uri.parse("package:${activity.packageName}")
                    }
                    
                    activity.startActivity(intent)
                } else {
                    Log.d(TAG, "✅ Permissão de Schedule Exact Alarm já concedida")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao solicitar permissão de Schedule Exact Alarm", e)
            }
        }
    }
    
    /**
     * Verifica se pode agendar alarmes exatos (Android 12+)
     */
    fun canScheduleExactAlarms(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
    }
    
    /**
     * Configura todas as otimizações necessárias
     */
    fun configureOptimizations(activity: Activity) {
        Log.d(TAG, "═══════════════════════════════════════════════")
        Log.d(TAG, "⚡ CONFIGURANDO OTIMIZAÇÕES DE BATERIA")
        Log.d(TAG, "═══════════════════════════════════════════════")
        
        // 1. Solicitar exclusão de otimização de bateria
        if (!isIgnoringBatteryOptimizations(activity)) {
            Log.d(TAG, "📋 Solicitando whitelist de bateria...")
            requestIgnoreBatteryOptimizations(activity)
        } else {
            Log.d(TAG, "✅ Já está na whitelist de bateria")
        }
        
        // 2. Solicitar permissão de Schedule Exact Alarm (Android 12+)
        if (!canScheduleExactAlarms(activity)) {
            Log.d(TAG, "⏰ Solicitando permissão de Schedule Exact Alarm...")
            requestScheduleExactAlarmPermission(activity)
        } else {
            Log.d(TAG, "✅ Permissão de Schedule Exact Alarm concedida")
        }
        
        Log.d(TAG, "═══════════════════════════════════════════════")
    }
}

