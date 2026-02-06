package com.mdm.launcher.utils

import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.mdm.launcher.data.ReceivedMessage
import java.text.SimpleDateFormat
import java.util.*

/**
 * Representa um app que foi acessado
 */
data class AccessedApp(
    val packageName: String,
    val appName: String,
    val accessTime: Long,
    val isAllowed: Boolean = true
)

/**
 * Rastreador de uso do aplicativo MDM Launcher
 */
class AppUsageTracker(private val context: Context) {
    
    companion object {
        private const val TAG = "AppUsageTracker"
        private const val PREF_NAME = "mdm_launcher"
        private const val KEY_LAST_ACCESS = "last_access_time"
        private const val KEY_ACCESS_COUNT = "access_count"
        private const val KEY_TOTAL_TIME = "total_time_ms"
        private const val KEY_SESSION_COUNT = "session_count"
        private const val KEY_ACCESSED_APPS = "accessed_apps"
        private const val MAX_HISTORY = 50 // Limitar histórico local
        private const val DUPLICATE_COOLDOWN = 30000L // 30 segundos entre registros do mesmo app
    }
    
    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    
    fun recordAppAccess(packageName: String, appName: String) {
        val currentTime = System.currentTimeMillis()
        val accessedApps = getAccessedApps().toMutableList()
        val isAllowed = isAppAllowed(packageName)
        
        // Evitar registros duplicados em curto intervalo
        val lastAccess = accessedApps.lastOrNull { it.packageName == packageName }
        if (lastAccess != null && (currentTime - lastAccess.accessTime) < DUPLICATE_COOLDOWN) {
            return
        }

        val newAccess = AccessedApp(
            packageName = packageName,
            appName = appName,
            accessTime = currentTime,
            isAllowed = isAllowed
        )
        
        accessedApps.add(newAccess)
        
        // Manter apenas os mais recentes
        if (accessedApps.size > MAX_HISTORY) {
            accessedApps.removeAt(0)
        }
        
        saveAccessedApps(accessedApps)
        
        // Atualizar contadores globais
        val accessCount = prefs.getInt(KEY_ACCESS_COUNT, 0) + 1
        prefs.edit()
            .putLong(KEY_LAST_ACCESS, currentTime)
            .putInt(KEY_ACCESS_COUNT, accessCount)
            .apply()
            
        Log.d(TAG, "📊 App registrado: $appName ($packageName)")
        
        // Enviar para o servidor
        sendUsageDataToServer(accessedApps)
    }
    
    private fun getAccessedApps(): List<AccessedApp> {
        val json = prefs.getString(KEY_ACCESSED_APPS, "[]")
        return try {
            val type = object : TypeToken<List<AccessedApp>>() {}.type
            Gson().fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    private fun saveAccessedApps(apps: List<AccessedApp>) {
        val json = Gson().toJson(apps)
        prefs.edit().putString(KEY_ACCESSED_APPS, json).apply()
    }
    
    private fun isAppAllowed(packageName: String): Boolean {
        if (packageName == context.packageName) return true
        val allowedJson = prefs.getString("allowed_apps", "[]") ?: "[]"
        return try {
            val type = object : TypeToken<List<String>>() {}.type
            val allowed: List<String> = Gson().fromJson(allowedJson, type)
            allowed.contains(packageName)
        } catch (e: Exception) {
            true
        }
    }
    
    private fun sendUsageDataToServer(accessedApps: List<AccessedApp>) {
        try {
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            dateFormat.timeZone = TimeZone.getTimeZone("UTC")
            val lastAccess = prefs.getLong(KEY_LAST_ACCESS, 0)
            
            val usageData = mapOf(
                "last_access" to if (lastAccess > 0) dateFormat.format(Date(lastAccess)) else null,
                "access_count" to prefs.getInt(KEY_ACCESS_COUNT, 0),
                "total_time_ms" to 0L,
                "total_time_formatted" to "N/D",
                "session_count" to prefs.getInt(KEY_SESSION_COUNT, 0),
                "is_tracking" to true,
                "accessed_apps" to accessedApps.takeLast(10).map { app ->
                    mapOf(
                        "packageName" to app.packageName,
                        "appName" to app.appName,
                        "accessTime" to app.accessTime,
                        "accessTimeFormatted" to dateFormat.format(Date(app.accessTime)),
                        "isAllowed" to app.isAllowed
                    )
                }
            )
            
            val message = mapOf(
                "type" to "app_usage",
                "deviceId" to DeviceIdManager.getDeviceId(context),
                "data" to usageData,
                "timestamp" to System.currentTimeMillis()
            )
            
            val jsonMessage = Gson().toJson(message)
            val serviceIntent = Intent(context, com.mdm.launcher.service.WebSocketService::class.java).apply {
                putExtra("message", jsonMessage)
                action = "com.mdm.launcher.SEND_MESSAGE"
            }
            context.startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar dados de uso", e)
        }
    }
}
