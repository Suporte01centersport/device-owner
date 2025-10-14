package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.mdm.launcher.service.WebSocketService

/**
 * BroadcastReceiver para eventos críticos do sistema
 * 
 * Garante que a conexão com o servidor seja restaurada após:
 * - Reinicialização do dispositivo (BOOT_COMPLETED)
 * - Mudanças de rede (CONNECTIVITY_CHANGE)
 * - Atualização do app (MY_PACKAGE_REPLACED)
 */
class SystemBootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "SystemBootReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "═════════════════════════════════════════════════")
        Log.d(TAG, "🔔 BROADCAST RECEBIDO: ${intent.action}")
        Log.d(TAG, "═════════════════════════════════════════════════")
        
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                Log.d(TAG, "📱 Dispositivo reiniciado - iniciando WebSocketService")
                handleBootCompleted(context)
            }
            "android.net.conn.CONNECTIVITY_CHANGE" -> {
                Log.d(TAG, "🌐 Mudança de conectividade detectada")
                handleConnectivityChange(context)
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Log.d(TAG, "📦 App atualizado - reiniciando serviços")
                handlePackageReplaced(context)
            }
            "android.intent.action.ACTION_POWER_CONNECTED" -> {
                Log.d(TAG, "🔌 Dispositivo conectado à energia")
                handlePowerConnected(context)
            }
            "android.intent.action.ACTION_POWER_DISCONNECTED" -> {
                Log.d(TAG, "🔋 Dispositivo desconectado da energia")
                // Não fazer nada, deixar o serviço continuar
            }
        }
        
        Log.d(TAG, "═════════════════════════════════════════════════")
    }
    
    private fun handleBootCompleted(context: Context) {
        try {
            Log.d(TAG, "Iniciando WebSocketService após boot...")
            
            // Salvar timestamp do último boot
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("last_boot_time", System.currentTimeMillis())
                .putBoolean("boot_completed", true)
                .apply()
            
            // Iniciar serviço WebSocket
            val serviceIntent = Intent(context, WebSocketService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            
            Log.d(TAG, "✅ WebSocketService iniciado com sucesso após boot")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar WebSocketService após boot", e)
        }
    }
    
    private fun handleConnectivityChange(context: Context) {
        try {
            Log.d(TAG, "Verificando conectividade...")
            
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork
            
            if (activeNetwork != null) {
                Log.d(TAG, "✅ Rede ativa detectada - notificando WebSocketService")
                
                // Salvar mudança de rede
                val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
                prefs.edit()
                    .putLong("last_network_change", System.currentTimeMillis())
                    .apply()
                
                // Verificar se WebSocketService está rodando
                val isServiceRunning = isServiceRunning(context, WebSocketService::class.java)
                
                if (isServiceRunning) {
                    Log.d(TAG, "WebSocketService já está rodando - enviando broadcast para reconectar")
                    
                    // Enviar broadcast para o serviço reconectar
                    val reconnectIntent = Intent("com.mdm.launcher.NETWORK_CHANGE")
                    reconnectIntent.setPackage(context.packageName)
                    context.sendBroadcast(reconnectIntent)
                    
                } else {
                    Log.d(TAG, "WebSocketService não está rodando - iniciando...")
                    val serviceIntent = Intent(context, WebSocketService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                }
                
            } else {
                Log.d(TAG, "❌ Nenhuma rede ativa detectada")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao lidar com mudança de conectividade", e)
        }
    }
    
    private fun handlePackageReplaced(context: Context) {
        try {
            Log.d(TAG, "App foi atualizado - reiniciando WebSocketService...")
            
            // Salvar timestamp da atualização
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("last_package_update", System.currentTimeMillis())
                .apply()
            
            // Reiniciar serviço
            val serviceIntent = Intent(context, WebSocketService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            
            Log.d(TAG, "✅ WebSocketService reiniciado após atualização do app")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao reiniciar serviço após atualização", e)
        }
    }
    
    private fun handlePowerConnected(context: Context) {
        try {
            Log.d(TAG, "Dispositivo conectado à energia - verificando saúde da conexão...")
            
            // Salvar timestamp
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("last_power_connected", System.currentTimeMillis())
                .apply()
            
            // Verificar se serviço está rodando
            val isServiceRunning = isServiceRunning(context, WebSocketService::class.java)
            
            if (!isServiceRunning) {
                Log.d(TAG, "WebSocketService não está rodando - iniciando...")
                val serviceIntent = Intent(context, WebSocketService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } else {
                Log.d(TAG, "WebSocketService já está rodando - enviando health check")
                val healthCheckIntent = Intent("com.mdm.launcher.HEALTH_CHECK")
                healthCheckIntent.setPackage(context.packageName)
                context.sendBroadcast(healthCheckIntent)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao lidar com conexão de energia", e)
        }
    }
    
    private fun isServiceRunning(context: Context, serviceClass: Class<*>): Boolean {
        return try {
            val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            @Suppress("DEPRECATION")
            manager.getRunningServices(Integer.MAX_VALUE).any {
                serviceClass.name == it.service.className
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar se serviço está rodando", e)
            false
        }
    }
}

