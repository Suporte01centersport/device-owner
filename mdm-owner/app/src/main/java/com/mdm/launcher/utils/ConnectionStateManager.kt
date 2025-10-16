package com.mdm.launcher.utils

import android.content.Context
import android.util.Log
import androidx.work.*
import com.mdm.launcher.workers.ConnectionHealthWorker
import java.util.concurrent.TimeUnit

/**
 * Gerenciador de estado de conexão persistente
 * 
 * Responsável por:
 * - Salvar/restaurar estado de conexão
 * - Agendar verificações periódicas com WorkManager
 * - Garantir reconexão automática
 */
object ConnectionStateManager {
    
    private const val TAG = "ConnectionStateManager"
    private const val PREFS_NAME = "mdm_connection_state"
    
    /**
     * Salva estado atual da conexão
     */
    fun saveConnectionState(context: Context, isConnected: Boolean) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean("is_connected", isConnected)
                putLong("last_state_change", System.currentTimeMillis())
                
                if (isConnected) {
                    putLong("last_connected_time", System.currentTimeMillis())
                    val totalConnections = prefs.getLong("total_connections", 0)
                    putLong("total_connections", totalConnections + 1)
                }
                
                apply()
            }
            
            Log.d(TAG, "Estado de conexão salvo: $isConnected")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar estado de conexão", e)
        }
    }
    
    /**
     * Recupera estado anterior da conexão
     */
    fun getConnectionState(context: Context): ConnectionState {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            
            ConnectionState(
                isConnected = prefs.getBoolean("is_connected", false),
                lastConnectedTime = prefs.getLong("last_connected_time", 0),
                lastStateChange = prefs.getLong("last_state_change", 0),
                totalConnections = prefs.getLong("total_connections", 0),
                lastBootTime = prefs.getLong("last_boot_time", 0),
                lastNetworkChange = prefs.getLong("last_network_change", 0)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao recuperar estado de conexão", e)
            ConnectionState()
        }
    }
    
    /**
     * Salva informações sobre servidor descoberto
     */
    fun saveServerInfo(context: Context, serverUrl: String, discoveryMethod: String) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString("last_server_url", serverUrl)
                putString("discovery_method", discoveryMethod)
                putLong("server_discovered_time", System.currentTimeMillis())
                apply()
            }
            
            Log.d(TAG, "Informações do servidor salvas: $serverUrl (método: $discoveryMethod)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar informações do servidor", e)
        }
    }
    
    /**
     * Agenda verificações periódicas de saúde da conexão
     */
    fun scheduleHealthChecks(context: Context) {
        try {
            Log.d(TAG, "🗓️ Agendando verificações periódicas de saúde...")
            
            // Constraints para executar o Worker
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED) // Requer conexão de rede
                .setRequiresBatteryNotLow(false) // Executar mesmo com bateria baixa (crítico)
                .setRequiresCharging(false) // Executar mesmo sem estar carregando
                .setRequiresDeviceIdle(false) // Executar mesmo com dispositivo ativo
                .build()
            
            // Criar request para execução periódica a cada 15 minutos
            val healthCheckRequest = PeriodicWorkRequestBuilder<ConnectionHealthWorker>(
                15, TimeUnit.MINUTES, // Intervalo de repetição
                5, TimeUnit.MINUTES   // Flex interval
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .addTag("connection_health")
                .build()
            
            // Agendar com replace em caso de já existir
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    ConnectionHealthWorker.WORK_NAME,
                    ExistingPeriodicWorkPolicy.UPDATE, // Atualizar se já existir
                    healthCheckRequest
                )
            
            Log.d(TAG, "✅ Verificações periódicas agendadas (15 min)")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao agendar verificações periódicas", e)
        }
    }
    
    /**
     * Cancela verificações periódicas (útil para debugging)
     */
    fun cancelHealthChecks(context: Context) {
        try {
            WorkManager.getInstance(context)
                .cancelUniqueWork(ConnectionHealthWorker.WORK_NAME)
            Log.d(TAG, "Verificações periódicas canceladas")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao cancelar verificações periódicas", e)
        }
    }
    
    /**
     * Obtém estatísticas de conexão
     */
    fun getConnectionStats(context: Context): Map<String, Any> {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val currentTime = System.currentTimeMillis()
            val lastConnected = prefs.getLong("last_connected_time", 0)
            val uptime = if (lastConnected > 0) currentTime - lastConnected else 0
            
            mapOf(
                "is_connected" to prefs.getBoolean("is_connected", false),
                "total_connections" to prefs.getLong("total_connections", 0),
                "uptime_seconds" to uptime / 1000,
                "last_server_url" to (prefs.getString("last_server_url", "não descoberto") ?: "não descoberto"),
                "discovery_method" to (prefs.getString("discovery_method", "nenhum") ?: "nenhum"),
                "last_boot" to prefs.getLong("last_boot_time", 0),
                "last_network_change" to prefs.getLong("last_network_change", 0)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao obter estatísticas", e)
            emptyMap()
        }
    }
    
    /**
     * Reset de estatísticas (útil para debugging)
     */
    fun resetStats(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().clear().apply()
            Log.d(TAG, "Estatísticas resetadas")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao resetar estatísticas", e)
        }
    }
    
    data class ConnectionState(
        val isConnected: Boolean = false,
        val lastConnectedTime: Long = 0,
        val lastStateChange: Long = 0,
        val totalConnections: Long = 0,
        val lastBootTime: Long = 0,
        val lastNetworkChange: Long = 0
    )
}

