package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * USB receiver desativado - USB sempre livre, sem bloqueio.
 */
class UsbConnectionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Não faz nada - USB sempre livre
    }
}
