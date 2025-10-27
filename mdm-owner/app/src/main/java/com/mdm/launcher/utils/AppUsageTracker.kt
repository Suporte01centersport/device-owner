package com.mdm.launcher.utils

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*

/**
 * Representa um app que foi acessado
 */
data class AccessedApp(
    val packageName: String,
    val appName: String,
    val accessTime: Long,
    val isAllowed: Boolean = true // Se o app está na lista de permitidos
)

/**
 * Rastreador de uso do aplicativo MDM Launcher
 * Coleta informações sobre quando e como o app foi usado
 */
class AppUsageTracker(private val context: Context) {
    
    companion object {
        private const val TAG = "AppUsageTracker"
        private const val PREF_NAME = "mdm_launcher" // ✅ CORREÇÃO: Usar o mesmo SharedPreferences que o resto do app
        private const val KEY_LAST_ACCESS = "last_access_time"
        private const val KEY_ACCESS_COUNT = "access_count"
        private const val KEY_TOTAL_TIME = "total_time_ms"
        private const val KEY_SESSION_COUNT = "session_count"
        private const val KEY_ACCESSED_APPS = "accessed_apps"
    }
    
    private val sharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isTracking = false
    private var sessionStartTime = 0L
    
    /**
     * Limpa todos os dados de uso (para resetar contadores)
     */
    fun clearAllData() {
        sharedPreferences.edit().clear().apply()
        Log.d(TAG, "🧹 Todos os dados de uso foram limpos")
    }
    
    /**
     * Inicia o rastreamento de uso
     */
    fun startTracking() {
        if (isTracking) return
        
        isTracking = true
        sessionStartTime = System.currentTimeMillis()
        
        Log.d(TAG, "🔍 Iniciando rastreamento de uso do app")
        
        // Iniciar monitoramento contínuo
        scope.launch {
            while (isTracking) {
                updateUsageStats()
                delay(30000) // Atualizar a cada 30 segundos
            }
        }
    }
    
    /**
     * Para o rastreamento
     */
    fun stopTracking() {
        isTracking = false
        scope.cancel()
        Log.d(TAG, "⏹️ Parando rastreamento de uso")
    }
    
    /**
     * Pausa o rastreamento (app sai de foco)
     */
    fun pauseTracking() {
        if (sessionStartTime > 0) {
            val sessionDuration = System.currentTimeMillis() - sessionStartTime
            addSessionTime(sessionDuration)
            sessionStartTime = 0
            Log.d(TAG, "⏸️ Pausando sessão - duração: ${sessionDuration}ms")
        }
    }
    
    /**
     * Registra um acesso ao app
     */
    fun recordAppAccess() {
        val currentTime = System.currentTimeMillis()
        val accessCount = sharedPreferences.getInt(KEY_ACCESS_COUNT, 0) + 1
        
        sharedPreferences.edit()
            .putLong(KEY_LAST_ACCESS, currentTime)
            .putInt(KEY_ACCESS_COUNT, accessCount)
            .apply()
            
        Log.d(TAG, "📱 Acesso registrado - total: $accessCount")
        
        // Enviar dados para o servidor
        sendUsageDataToServer()
    }
    
    /**
     * Registra acesso a um app específico
     */
    fun recordAppAccess(packageName: String, appName: String) {
        val currentTime = System.currentTimeMillis()
        val accessedApps = getAccessedApps()
        
        Log.d(TAG, "📱 === REGISTRANDO ACESSO AO APP ===")
        Log.d(TAG, "📱 App: $appName ($packageName)")
        Log.d(TAG, "📱 Timestamp: $currentTime")
        Log.d(TAG, "📱 Apps já acessados: ${accessedApps.size}")
        
        // Verificar se o app está na lista de permitidos
        val isAllowed = isAppAllowed(packageName)
        
        // Verificar se já existe um acesso recente (últimos 5 minutos)
        val recentAccess = accessedApps.find { 
            it.packageName == packageName && 
            (currentTime - it.accessTime) < (5 * 60 * 1000)
        }
        
        if (recentAccess == null) {
            val newAccess = AccessedApp(
                packageName = packageName,
                appName = appName,
                accessTime = currentTime,
                isAllowed = isAllowed
            )
            
            val updatedApps = accessedApps + newAccess
            saveAccessedApps(updatedApps)
            
            Log.d(TAG, "✅ App acessado registrado: $appName ($packageName) - Permitido: $isAllowed")
            Log.d(TAG, "📊 Total de apps acessados: ${updatedApps.size}")
            
            // Enviar dados atualizados para o servidor IMEDIATAMENTE
            Log.d(TAG, "📤 Enviando dados de uso para o servidor...")
            sendUsageDataToServer()
        } else {
            // Atualizar o isAllowed do acesso recente também
            val updatedRecentAccess = recentAccess.copy(isAllowed = isAllowed)
            val updatedApps = accessedApps.map { if (it == recentAccess) updatedRecentAccess else it }
            saveAccessedApps(updatedApps)
            
            Log.d(TAG, "⚠️ Acesso recente já registrado para $appName (últimos 5min), atualizando isAllowed: $isAllowed")
            // Mesmo assim, enviar dados atualizados
            Log.d(TAG, "📤 Enviando dados atualizados mesmo com acesso recente...")
            sendUsageDataToServer()
        }
        
        Log.d(TAG, "📱 === FIM REGISTRO ACESSO ===")
    }
    
    
    /**
     * Obtém lista de apps acessados
     */
    private fun getAccessedApps(): List<AccessedApp> {
        val jsonString = sharedPreferences.getString(KEY_ACCESSED_APPS, "[]")
        return try {
            // Implementação simples sem Gson para evitar dependências extras
            parseAccessedAppsJson(jsonString ?: "[]")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar apps acessados", e)
            emptyList()
        }
    }
    
    /**
     * Salva lista de apps acessados
     */
    private fun saveAccessedApps(apps: List<AccessedApp>) {
        val jsonString = serializeAccessedAppsJson(apps)
        sharedPreferences.edit()
            .putString(KEY_ACCESSED_APPS, jsonString)
            .apply()
    }
    
    /**
     * Serializa apps acessados para JSON simples
     */
    private fun serializeAccessedAppsJson(apps: List<AccessedApp>): String {
        val jsonBuilder = StringBuilder("[")
        apps.forEachIndexed { index, app ->
            if (index > 0) jsonBuilder.append(",")
            jsonBuilder.append("{")
            jsonBuilder.append("\"packageName\":\"${app.packageName}\",")
            jsonBuilder.append("\"appName\":\"${app.appName}\",")
            jsonBuilder.append("\"accessTime\":${app.accessTime},")
            jsonBuilder.append("\"isAllowed\":${app.isAllowed}")
            jsonBuilder.append("}")
        }
        jsonBuilder.append("]")
        return jsonBuilder.toString()
    }
    
    /**
     * Parseia JSON simples de apps acessados
     */
    private fun parseAccessedAppsJson(json: String): List<AccessedApp> {
        if (json == "[]" || json.isEmpty()) return emptyList()
        
        val apps = mutableListOf<AccessedApp>()
        val cleanJson = json.replace("[", "").replace("]", "")
        val entries = cleanJson.split("},{")
        
        entries.forEach { entry ->
            try {
                val cleanEntry = entry.replace("{", "").replace("}", "")
                val parts = cleanEntry.split(",")
                
                var packageName = ""
                var appName = ""
                var accessTime = 0L
                var isAllowed = true
                
                parts.forEach { part ->
                    val keyValue = part.split(":")
                    if (keyValue.size == 2) {
                        val key = keyValue[0].replace("\"", "").trim()
                        val value = keyValue[1].replace("\"", "").trim()
                        
                        when (key) {
                            "packageName" -> packageName = value
                            "appName" -> appName = value
                            "accessTime" -> accessTime = value.toLongOrNull() ?: 0L
                            "isAllowed" -> isAllowed = value.toBoolean()
                        }
                    }
                }
                
                if (packageName.isNotEmpty() && appName.isNotEmpty()) {
                    apps.add(AccessedApp(packageName, appName, accessTime, isAllowed))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao parsear entrada de app acessado: $entry", e)
            }
        }
        
        return apps.sortedBy { it.accessTime } // Ordenar por tempo crescente
    }
    
    /**
     * Adiciona tempo de sessão
     */
    private fun addSessionTime(duration: Long) {
        val totalTime = sharedPreferences.getLong(KEY_TOTAL_TIME, 0) + duration
        val sessionCount = sharedPreferences.getInt(KEY_SESSION_COUNT, 0) + 1
        
        sharedPreferences.edit()
            .putLong(KEY_TOTAL_TIME, totalTime)
            .putInt(KEY_SESSION_COUNT, sessionCount)
            .apply()
            
        Log.d(TAG, "⏱️ Sessão adicionada - duração: ${duration}ms, total: ${totalTime}ms")
    }
    
    /**
     * Atualiza estatísticas de uso usando UsageStatsManager
     */
    private suspend fun updateUsageStats() {
        try {
            Log.d(TAG, "📊 Atualizando estatísticas de uso com UsageStatsManager")
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
                val currentTime = System.currentTimeMillis()
                
                // Obter estatísticas dos últimos 24 horas
                val stats = usageStatsManager.queryUsageStats(
                    android.app.usage.UsageStatsManager.INTERVAL_DAILY,
                    currentTime - (24 * 60 * 60 * 1000),
                    currentTime
                )
                
                if (stats != null && stats.isNotEmpty()) {
                    Log.d(TAG, "📊 Estatísticas obtidas: ${stats.size} apps")
                    
                    // Função removida - duração não é mais rastreada
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao atualizar estatísticas", e)
        }
    }
    
    /**
     * Envia dados de uso para o servidor
     */
    private fun sendUsageDataToServer() {
        scope.launch {
            try {
                val usageData = getUsageData()
                
                Log.d(TAG, "📤 === ENVIANDO DADOS DE USO ===")
                Log.d(TAG, "📤 Apps acessados: ${usageData["accessed_apps"]}")
                Log.d(TAG, "📤 Total de dados: ${usageData.size}")
                
                val message = mapOf(
                    "type" to "app_usage",
                    "deviceId" to DeviceIdManager.getDeviceId(context),
                    "data" to usageData,
                    "timestamp" to System.currentTimeMillis()
                )
                
                // Enviar via WebSocket diretamente
                val gson = com.google.gson.Gson()
                val jsonMessage = gson.toJson(message)
                
                Log.d(TAG, "📤 JSON enviado: $jsonMessage")
                
                // Enviar apenas via startService (método mais confiável)
                val serviceIntent = Intent(context, com.mdm.launcher.service.WebSocketService::class.java).apply {
                    putExtra("usage_data", jsonMessage)
                    action = "com.mdm.launcher.SEND_USAGE_DATA"
                }
                context.startService(serviceIntent)

                Log.d(TAG, "✅ Dados de uso enviados para o servidor (1 método)")
                Log.d(TAG, "📤 === FIM ENVIO DADOS ===")
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao enviar dados de uso", e)
            }
        }
    }
    
    /**
     * Obtém dados de uso consolidados
     */
    fun getUsageData(): Map<String, Any?> {
        val lastAccess = sharedPreferences.getLong(KEY_LAST_ACCESS, 0)
        val accessCount = sharedPreferences.getInt(KEY_ACCESS_COUNT, 0)
        val totalTime = sharedPreferences.getLong(KEY_TOTAL_TIME, 0)
        val sessionCount = sharedPreferences.getInt(KEY_SESSION_COUNT, 0)
        
        val dateFormat = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault())
        
        // Obter apps acessados
        val accessedApps = getAccessedApps()
        
        return mapOf(
            "last_access" to if (lastAccess > 0) dateFormat.format(Date(lastAccess)) else "Nunca",
            "access_count" to accessCount,
            "total_time_ms" to 0L,
            "total_time_formatted" to "N/D",
            "session_count" to sessionCount,
            "is_tracking" to isTracking,
            "current_session_start" to if (sessionStartTime > 0) dateFormat.format(Date(sessionStartTime)) else null,
            "accessed_apps" to accessedApps.map { app ->
                mapOf(
                    "packageName" to app.packageName,
                    "appName" to app.appName,
                    "accessTime" to app.accessTime,
                    "accessTimeFormatted" to dateFormat.format(Date(app.accessTime)),
                    "isAllowed" to app.isAllowed
                )
            }
        )
    }
    
    /**
     * Formata tempo em formato legível
     */
    private fun formatTime(milliseconds: Long): String {
        val seconds = milliseconds / 1000
        val minutes = seconds / 60
        val hours = minutes / 60
        val days = hours / 24
        
        return when {
            days > 0 -> "${days}d ${hours % 24}h ${minutes % 60}m"
            hours > 0 -> "${hours}h ${minutes % 60}m ${seconds % 60}s"
            minutes > 0 -> "${minutes}m ${seconds % 60}s"
            else -> "${seconds}s"
        }
    }
    
    /**
     * Verifica se um app está na lista de permitidos
     */
    private fun isAppAllowed(packageName: String): Boolean {
        return try {
            // Buscar lista de apps permitidos do SharedPreferences (formato JSON)
            val allowedAppsJson = sharedPreferences.getString("allowed_apps", "[]") ?: "[]"
            
            // Parse do JSON para lista de strings
            val gson = com.google.gson.Gson()
            val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
            val allowedApps: List<String> = gson.fromJson(allowedAppsJson, type)
            
            // Verificar se o packageName está na lista
            val isAllowed = allowedApps.contains(packageName)
            
            Log.d(TAG, "🔍 App $packageName é permitido: $isAllowed (lista: ${allowedApps.size} apps)")
            isAllowed
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao verificar se app é permitido: $packageName", e)
            true // Por padrão, considerar permitido se houver erro
        }
    }
    
    /**
     * Atualiza a lista de apps permitidos
     */
    fun updateAllowedApps(allowedApps: List<String>) {
        try {
            // Usar Gson para serializar corretamente
            val gson = com.google.gson.Gson()
            val allowedAppsJson = gson.toJson(allowedApps)
            
            sharedPreferences.edit()
                .putString("allowed_apps", allowedAppsJson)
                .apply()
            
            Log.d(TAG, "✅ Lista de apps permitidos atualizada: ${allowedApps.size} apps")
            Log.d(TAG, "✅ JSON salvo: $allowedAppsJson")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao atualizar lista de apps permitidos", e)
        }
    }
}
