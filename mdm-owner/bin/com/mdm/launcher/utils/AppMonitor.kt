package com.mdm.launcher.utils

import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Monitor de aplicativos em tempo real
 */
object AppMonitor {
    private const val TAG = "AppMonitor"
    private var isMonitoring = false
    private val handler = Handler(Looper.getMainLooper())
    private var appContext: Context? = null
    private var usageTracker: AppUsageTracker? = null
    
    private const val MONITOR_INTERVAL = 2000L // 2 segundos
    private var lastForegroundPackage = ""

    private val monitorRunnable = object : Runnable {
        override fun run() {
            if (!isMonitoring) return
            val ctx = appContext ?: return
            
            try {
                val foregroundPackage = getForegroundPackage(ctx)
                if (foregroundPackage != null && foregroundPackage != lastForegroundPackage) {
                    // Ignorar o próprio MDM e sistema básico
                    if (foregroundPackage != ctx.packageName && !isSystemCore(foregroundPackage)) {
                        // REGRA: Só registrar se o app tiver um launcher intent (aparece no drawer)
                        if (hasLauncherIntent(ctx, foregroundPackage)) {
                            val appName = getAppName(ctx, foregroundPackage)
                            usageTracker?.recordAppAccess(foregroundPackage, appName)
                            lastForegroundPackage = foregroundPackage
                        }
                    } else if (foregroundPackage == ctx.packageName) {
                        lastForegroundPackage = foregroundPackage
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro no monitoramento: ${e.message}")
            }
            
            handler.postDelayed(this, MONITOR_INTERVAL)
        }
    }

    fun start(context: Context) {
        if (isMonitoring) return
        appContext = context.applicationContext
        usageTracker = AppUsageTracker(context)
        isMonitoring = true
        handler.post(monitorRunnable)
        Log.d(TAG, "🚀 Monitoramento de apps iniciado")
    }

    fun stop() {
        isMonitoring = false
        handler.removeCallbacks(monitorRunnable)
        Log.d(TAG, "⏹️ Monitoramento de apps parado")
    }

    private fun getForegroundPackage(context: Context): String? {
        // Método mais preciso: UsageStatsManager (requer permissão especial)
        try {
            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val time = System.currentTimeMillis()
            // Verificar o último minuto
            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, time - 1000 * 60, time)
            if (stats != null && stats.isNotEmpty()) {
                val sortedStats = stats.sortedByDescending { it.lastTimeUsed }
                return sortedStats[0].packageName
            }
        } catch (e: Exception) {
            // Falha silenciosa se não tiver permissão
        }
        
        // Fallback: ActivityManager (limitado em versões novas do Android)
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val tasks = am.getRunningTasks(1)
            if (tasks.isNotEmpty()) {
                tasks[0].topActivity?.packageName
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun isSystemCore(packageName: String): Boolean {
        val core = listOf("android", "com.android.systemui", "com.android.settings", "com.google.android.packageinstaller")
        return core.contains(packageName)
    }

    private fun hasLauncherIntent(context: Context, packageName: String): Boolean {
        return try {
            // Verificar se o app possui uma activity que pode ser lançada pelo usuário
            context.packageManager.getLaunchIntentForPackage(packageName) != null
        } catch (e: Exception) {
            false
        }
    }

    private fun getAppName(context: Context, packageName: String): String {
        return try {
            val pm = context.packageManager
            val ai = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(ai).toString()
        } catch (e: Exception) {
            packageName
        }
    }
}
