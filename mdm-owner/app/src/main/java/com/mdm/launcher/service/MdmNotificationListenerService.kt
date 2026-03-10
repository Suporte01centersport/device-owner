package com.mdm.launcher.service

import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Bloqueia TODAS as notificações exceto as do próprio app MDM.
 * - onListenerConnected: cancela todas as notificações existentes imediatamente ao conectar.
 * - onNotificationPosted: cancela na chegada qualquer notificação de outro pacote.
 * - onNotificationRankingUpdate: varredura extra para eliminar qualquer notificação restante.
 * - Mantém apenas: foreground service do MDM (FLAG_ONGOING_EVENT) e tag "mdm_web".
 * - Captura erros do WMS e encaminha como mensagem de suporte.
 */
class MdmNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "MdmNotificationListener"
        const val WEB_NOTIFICATION_TAG = "mdm_web"
        const val PACKAGE_NAME = "com.mdm.launcher"
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        cancelAllForeignNotifications()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        // Capturar notificações do WMS e encaminhar como mensagem de suporte
        if (sbn.packageName == "com.centersporti.wmsmobile") {
            val extras = sbn.notification?.extras
            val title = extras?.getCharSequence("android.title")?.toString() ?: ""
            val text = extras?.getCharSequence("android.bigText")?.toString()
                ?: extras?.getCharSequence("android.text")?.toString() ?: ""
            val combined = listOf(title, text).filter { it.isNotBlank() }.joinToString(": ")
            if (combined.isNotBlank()) {
                val errorIntent = Intent("com.mdm.launcher.WMS_ERROR").apply {
                    setPackage(packageName)
                    putExtra("error_text", combined)
                }
                sendBroadcast(errorIntent)
                Log.d(TAG, "Erro WMS capturado: $combined")
            }
        }

        if (shouldCancel(sbn)) {
            try {
                cancelNotification(sbn.key)
                Log.d(TAG, "Bloqueada: ${sbn.packageName} | ${sbn.notification?.extras?.getCharSequence("android.title")}")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao cancelar notificação: ${e.message}")
            }
        }
    }

    override fun onNotificationRankingUpdate(rankingMap: RankingMap?) {
        // Varredura extra: elimina qualquer notificação estranha que tenha passado
        cancelAllForeignNotifications()
    }

    /** Cancela imediatamente todas as notificações de outros apps que estejam ativas */
    private fun cancelAllForeignNotifications() {
        try {
            val active = activeNotifications ?: return
            var count = 0
            for (sbn in active) {
                if (shouldCancel(sbn)) {
                    try {
                        cancelNotification(sbn.key)
                        count++
                    } catch (_: Exception) {}
                }
            }
            if (count > 0) Log.d(TAG, "🧹 $count notificações de outros apps removidas")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar notificações existentes: ${e.message}")
        }
    }

    /**
     * Retorna true se a notificação deve ser cancelada.
     * Mantém APENAS:
     *   - Foreground service do MDM (FLAG_ONGOING_EVENT) — necessário para serviço continuar rodando
     *   - Tag "mdm_web" — enviadas pelo painel web ao operador
     * Tudo o mais é cancelado, incluindo notificações de sistema, outros apps e Android.
     */
    private fun shouldCancel(sbn: StatusBarNotification): Boolean {
        if (sbn.packageName != PACKAGE_NAME) return true
        if (sbn.notification?.flags?.and(android.app.Notification.FLAG_ONGOING_EVENT) != 0) return false
        if (sbn.tag == WEB_NOTIFICATION_TAG) return false
        return true
    }
}
