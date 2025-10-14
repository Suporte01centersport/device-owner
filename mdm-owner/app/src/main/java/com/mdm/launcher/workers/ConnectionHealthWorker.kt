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
 * Garante que o WebSocketService esteja sempre rodando e conectado
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
        Log.d(TAG, "═════════════════════════════════════════════════")
        Log.d(TAG, "🏥 VERIFICAÇÃO DE SAÚDE DA CONEXÃO INICIADA")
        Log.d(TAG, "═════════════════════════════════════════════════")
        
        return try {
            // Verificar estado da conexão
            val prefs = applicationContext.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            val lastConnectedTime = prefs.getLong("last_connected_time", 0)
            val isConnected = prefs.getBoolean("is_connected", false)
            val currentTime = System.currentTimeMillis()
            val timeSinceLastConnection = currentTime - lastConnectedTime
            
            Log.d(TAG, "Estado atual:")
            Log.d(TAG, "  - Conectado: $isConnected")
            Log.d(TAG, "  - Última conexão: ${timeSinceLastConnection / 1000}s atrás")
            
            // Se desconectado há mais de 2 minutos, forçar reconexão
            if (!isConnected || timeSinceLastConnection > 120000) {
                Log.w(TAG, "⚠️ Conexão perdida ou inativa - forçando reconexão...")
                
                // Verificar se WebSocketService está rodando
                val isServiceRunning = isServiceRunning(WebSocketService::class.java)
                
                if (!isServiceRunning) {
                    Log.d(TAG, "WebSocketService não está rodando - iniciando...")
                    startWebSocketService()
                } else {
                    Log.d(TAG, "WebSocketService está rodando - enviando comando de reconexão")
                    sendReconnectBroadcast()
                }
            } else {
                Log.d(TAG, "✅ Conexão saudável")
            }
            
            // Verificar conectividade de rede
            val connectivityManager = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val hasNetwork = connectivityManager.activeNetwork != null
            
            if (!hasNetwork) {
                Log.w(TAG, "❌ Sem conectividade de rede - aguardando rede voltar")
                return Result.retry() // Tentar novamente mais tarde
            }
            
            Log.d(TAG, "═════════════════════════════════════════════════")
            Log.d(TAG, "✅ Verificação de saúde concluída com sucesso")
            Log.d(TAG, "═════════════════════════════════════════════════")
            
            Result.success()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao verificar saúde da conexão", e)
            Result.retry()
        }
    }
    
    private fun startWebSocketService() {
        try {
            val serviceIntent = Intent(applicationContext, WebSocketService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(serviceIntent)
            } else {
                applicationContext.startService(serviceIntent)
            }
            Log.d(TAG, "✅ WebSocketService iniciado pelo Worker")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar WebSocketService", e)
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

