package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.launcher.DeviceAdminReceiver

/**
 * Intercepta tentativa de desligar o dispositivo e força reinício em vez disso.
 * Útil para modo kiosk onde o dispositivo deve sempre reiniciar, nunca desligar.
 */
class ShutdownReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ShutdownReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_SHUTDOWN) return

        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)

            if (dpm.isDeviceOwnerApp(context.packageName)) {
                Log.w(TAG, "Desligamento interceptado - forçando REINÍCIO em vez de desligar")
                dpm.reboot(adminComponent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao forçar reinício", e)
        }
    }
}
