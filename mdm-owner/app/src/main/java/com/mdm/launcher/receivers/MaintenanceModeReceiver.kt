package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver estático para receber comando de encerramento do modo manutenção
 * Este receiver está registrado no Manifest e sempre estará disponível,
 * mesmo se o WebSocketService for morto pelo Android
 */
class MaintenanceModeReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "MaintenanceModeReceiver"
    }
    
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        
        when (intent.action) {
            "com.mdm.launcher.END_MAINTENANCE" -> {
                Log.d(TAG, "🔧 ═══════════════════════════════════════════════")
                Log.d(TAG, "🔧 BROADCAST RECEBIDO: END_MAINTENANCE")
                Log.d(TAG, "🔧 Origem: Notificação de Modo Manutenção")
                Log.d(TAG, "🔧 ═══════════════════════════════════════════════")
                
                try {
                    // Desativar modo manutenção nas preferências
                    val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                    prefs.edit()
                        .putBoolean("maintenance_mode", false)
                        .putLong("maintenance_expiry", 0)
                        .apply()
                    
                    Log.d(TAG, "✅ Modo manutenção desativado nas preferências")
                    
                    // Remover notificação
                    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                    notificationManager.cancel(2000)
                    Log.d(TAG, "✅ Notificação removida")
                    
                    // Enviar broadcast para o service processar o resto (desabilitar launchers, voltar ao MDM)
                    val serviceIntent = Intent("com.mdm.launcher.END_MAINTENANCE_INTERNAL")
                    serviceIntent.setPackage(context.packageName)
                    context.sendBroadcast(serviceIntent)
                    Log.d(TAG, "✅ Broadcast enviado para o service processar")
                    
                    // Voltar ao launcher MDM imediatamente
                    val launcherIntent = Intent(context, com.mdm.launcher.MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    }
                    context.startActivity(launcherIntent)
                    Log.d(TAG, "🏠 Voltando ao launcher MDM")
                    
                    Log.d(TAG, "🔧 ═══════════════════════════════════════════════")
                    
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Erro ao processar encerramento de modo manutenção", e)
                }
            }
        }
    }
}

