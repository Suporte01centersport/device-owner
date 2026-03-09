package com.mdm.launcher.service

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Bloqueia todas as notificações exceto as enviadas pelo painel web (MDM).
 * Permite apenas: (1) notificações do web com tag "mdm_web", (2) foreground do próprio app.
 */
class MdmNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "MdmNotificationListener"
        const val WEB_NOTIFICATION_TAG = "mdm_web"
        const val PACKAGE_NAME = "com.mdm.launcher"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        if (shouldCancel(sbn)) {
            try {
                cancelNotification(sbn.key)
                Log.d(TAG, "Bloqueada: ${sbn.packageName} - ${sbn.notification?.extras?.getCharSequence("android.title")}")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao cancelar: ${e.message}")
            }
        }
    }

    /** Cancela se NÃO for: nosso app com (ongoing OU tag mdm_web) */
    private fun shouldCancel(sbn: StatusBarNotification): Boolean {
        if (sbn.packageName != PACKAGE_NAME) return true
        if (sbn.notification?.flags?.and(android.app.Notification.FLAG_ONGOING_EVENT) != 0) return false
        if (sbn.tag == WEB_NOTIFICATION_TAG) return false
        return true
    }
}
