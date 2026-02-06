package com.mdm.launcher.utils

import android.content.Context
import android.util.Log

/**
 * Gerenciador de estado de conexão persistente
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
     * Agenda verificações periódicas de saúde da conexão (DESATIVADO)
     */
    fun scheduleHealthChecks(context: Context) {
        // Funcionalidade removida para simplificação
    }
    
    /**
     * Cancela verificações periódicas
     */
    fun cancelHealthChecks(context: Context) {
        // Funcionalidade removida
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
