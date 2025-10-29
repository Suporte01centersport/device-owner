package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mdm.launcher.service.WebSocketService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        try {
            val pendingResult = goAsync()
            
            scope.launch {
                try {
                    when (intent.action) {
                        Intent.ACTION_BOOT_COMPLETED -> {
                            delay(10000)
                            handleBootCompleted(context)
                        }
                        "android.net.conn.CONNECTIVITY_CHANGE" -> {
                            handleConnectivityChange(context)
                        }
                        Intent.ACTION_MY_PACKAGE_REPLACED -> {
                            delay(2000)
                            handlePackageReplaced(context)
                        }
                        "android.intent.action.ACTION_POWER_CONNECTED" -> {
                            handlePowerConnected(context)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro no processamento", e)
                } finally {
                    pendingResult.finish()
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro crítico no SystemBootReceiver", e)
        }
    }
    
    private fun handleBootCompleted(context: Context) {
        try {
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            val lastBootTime = prefs.getLong("last_boot_time", 0)
            val currentTime = System.currentTimeMillis()
            
            if (currentTime - lastBootTime < 60000) {
                return
            }
            
            prefs.edit()
                .putLong("last_boot_time", currentTime)
                .putBoolean("boot_completed", true)
                .apply()
            
            if (currentTime - lastBootTime > 300000) {
                prefs.edit().putInt("boot_attempts", 0).apply()
            }
            
            val bootAttempts = prefs.getInt("boot_attempts", 0)
            prefs.edit().putInt("boot_attempts", bootAttempts + 1).apply()
            
            if (bootAttempts >= 3) {
                Log.e(TAG, "Muitas tentativas de boot - desabilitando reinicialização automática")
                return
            }
            
            val isServiceRunning = isServiceRunning(context, WebSocketService::class.java)
            if (!isServiceRunning) {
                val serviceIntent = Intent(context, WebSocketService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d(TAG, "WebSocketService iniciado após boot")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar serviço após boot", e)
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("last_boot_error", e.message)
                .putLong("last_boot_error_time", System.currentTimeMillis())
                .apply()
        }
    }
    
    private fun handleConnectivityChange(context: Context) {
        try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork
            
            if (activeNetwork != null) {
                val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
                prefs.edit()
                    .putLong("last_network_change", System.currentTimeMillis())
                    .apply()
                
                val isServiceRunning = isServiceRunning(context, WebSocketService::class.java)
                
                if (isServiceRunning) {
                    val reconnectIntent = Intent("com.mdm.launcher.NETWORK_CHANGE")
                    reconnectIntent.setPackage(context.packageName)
                    context.sendBroadcast(reconnectIntent)
                } else {
                    val serviceIntent = Intent(context, WebSocketService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao lidar com mudança de conectividade", e)
        }
    }
    
    private fun handlePackageReplaced(context: Context) {
        try {
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("last_package_update", System.currentTimeMillis())
                .apply()
            
            val serviceIntent = Intent(context, WebSocketService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            
            Log.d(TAG, "WebSocketService reiniciado após atualização")
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao reiniciar serviço após atualização", e)
        }
    }
    
    private fun handlePowerConnected(context: Context) {
        try {
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("last_power_connected", System.currentTimeMillis())
                .apply()
            
            val isServiceRunning = isServiceRunning(context, WebSocketService::class.java)
            
            if (!isServiceRunning) {
                val serviceIntent = Intent(context, WebSocketService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } else {
                val healthCheckIntent = Intent("com.mdm.launcher.HEALTH_CHECK")
                healthCheckIntent.setPackage(context.packageName)
                context.sendBroadcast(healthCheckIntent)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao lidar com conexão de energia", e)
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

