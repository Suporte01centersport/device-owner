package com.mdm.launcher.workers

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mdm.launcher.service.WebSocketService

/**
 * Worker para verificação periódica da saúde da conexão
 * 
 * Executado pelo WorkManager em background, mesmo quando o app está fechado
 * Garante que o  esteja sempre rodando e conectado
 */
class ConnectionHealthWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    companion object {
        private const val TAG = "ConnectionHealthWorker"
        const val WORK_NAME = "connection_health_check"
    }
    
    override suspend fun doWork(): Result {
        return try {
            val prefs = applicationContext.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            val lastConnectedTime = prefs.getLong("last_connected_time", 0)
            val isConnected = prefs.getBoolean("is_connected", false)
            val currentTime = System.currentTimeMillis()
            val timeSinceLastConnection = currentTime - lastConnectedTime
            
            if (!isConnected || timeSinceLastConnection > 120000) {
                val isServiceRunning = isServiceRunning(WebSocketService::class.java)
                
                if (!isServiceRunning) {
                    start()
                } else {
                    sendReconnectBroadcast()
                }
            }
            
            val connectivityManager = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val hasNetwork = connectivityManager.activeNetwork != null
            
            if (!hasNetwork) {
                return Result.retry()
            }
            
            Result.success()
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro na verificação de saúde", e)
            Result.retry()
        }
    }
    
    private fun start() {
        try {
            val serviceIntent = Intent(applicationContext, WebSocketService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(serviceIntent)
            } else {
                applicationContext.startService(serviceIntent)
            }
            Log.d(TAG, "✅  iniciado pelo Worker")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar ", e)
        }
    }
    
    private fun sendReconnectBroadcast() {
        try {
            val reconnectIntent = Intent("com.mdm.launcher.FORCE_RECONNECT")
            reconnectIntent.setPackage(applicationContext.packageName)
            applicationContext.sendBroadcast(reconnectIntent)
            Log.d(TAG, "✅ Broadcast de reconexão enviado")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao enviar broadcast de reconexão", e)
        }
    }
    
    private fun isServiceRunning(serviceClass: Class<*>): Boolean {
        return try {
            val manager = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
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

