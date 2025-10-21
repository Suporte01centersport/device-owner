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
            Log.d(TAG, "═════════════════════════════════════════════════")
            Log.d(TAG, "🔔 BROADCAST RECEBIDO: ${intent.action}")
            Log.d(TAG, "═════════════════════════════════════════════════")
            
            // Usar goAsync() para processar em background sem bloquear o boot
            val pendingResult = goAsync()
            
            scope.launch {
                try {
                    when (intent.action) {
                        Intent.ACTION_BOOT_COMPLETED -> {
                            Log.d(TAG, "📱 Dispositivo reiniciado - aguardando estabilização...")
                            // Aguardar assincronamente
                            delay(10000) // 10 segundos para sistema estabilizar
                            handleBootCompleted(context)
                        }
                        "android.net.conn.CONNECTIVITY_CHANGE" -> {
                            Log.d(TAG, "🌐 Mudança de conectividade detectada")
                            handleConnectivityChange(context)
                        }
                        Intent.ACTION_MY_PACKAGE_REPLACED -> {
                            Log.d(TAG, "📦 App atualizado - reiniciando serviços")
                            delay(2000)
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
                } catch (e: Exception) {
                    Log.e(TAG, "❌ ERRO no processamento assíncrono", e)
                } finally {
                    // IMPORTANTE: Notificar que o processamento terminou
                    pendingResult.finish()
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ ERRO CRÍTICO no SystemBootReceiver - pode causar boot loop!", e)
            // Não relançar a exceção para evitar crash do sistema
        }
    }
    
    private fun handleBootCompleted(context: Context) {
        try {
            Log.d(TAG, "Iniciando WebSocketService após boot...")
            
            // Verificar se já existe um boot em andamento para evitar loops
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            val lastBootTime = prefs.getLong("last_boot_time", 0)
            val currentTime = System.currentTimeMillis()
            
            // Se o último boot foi há menos de 60 segundos, não iniciar novamente
            if (currentTime - lastBootTime < 60000) {
                Log.w(TAG, "⚠️ Boot muito recente detectado (há ${(currentTime - lastBootTime) / 1000}s) - evitando reinicialização")
                return
            }
            
            // Salvar timestamp do último boot
            prefs.edit()
                .putLong("last_boot_time", currentTime)
                .putBoolean("boot_completed", true)
                .apply()
            
            // Resetar contador de boot attempts se passou mais de 5 minutos
            if (currentTime - lastBootTime > 300000) {
                prefs.edit().putInt("boot_attempts", 0).apply()
            }
            
            val bootAttempts = prefs.getInt("boot_attempts", 0)
            prefs.edit().putInt("boot_attempts", bootAttempts + 1).apply()
            
            // Verificar número de tentativas de boot para evitar loops infinitos
            if (bootAttempts >= 3) {
                Log.e(TAG, "❌ Muitas tentativas de boot detectadas ($bootAttempts) - possível boot loop!")
                Log.e(TAG, "❌ Desabilitando inicialização automática para evitar crash do sistema")
                Log.e(TAG, "ℹ️ Para reabilitar, limpe os dados do app ou execute: adb shell pm clear com.mdm.launcher")
                return
            }
            
            // Verificar se o serviço já está rodando antes de iniciar
            val isServiceRunning = isServiceRunning(context, WebSocketService::class.java)
            if (!isServiceRunning) {
                Log.d(TAG, "Iniciando WebSocketService (tentativa $bootAttempts)...")
                val serviceIntent = Intent(context, WebSocketService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d(TAG, "✅ WebSocketService iniciado com sucesso após boot")
            } else {
                Log.d(TAG, "✅ WebSocketService já está rodando - não reiniciando")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar WebSocketService após boot", e)
            // Salvar erro para debug
            val prefs = context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("last_boot_error", e.message)
                .putLong("last_boot_error_time", System.currentTimeMillis())
                .apply()
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

