package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.launcher.UsbUnlockActivity

/**
 * Detecta quando um cabo USB é conectado.
 * Se USB estiver bloqueado, abre a tela de senha para desbloqueio.
 */
class UsbConnectionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "UsbConnectionReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.hardware.usb.action.USB_STATE") return

        val connected = intent.getBooleanExtra("connected", false)
        if (!connected) {
            // USB desconectado - resetar desbloqueio temporário
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            if (prefs.getBoolean("usb_temp_unlocked", false)) {
                Log.d(TAG, "USB desconectado - removendo desbloqueio temporário")
                prefs.edit().putBoolean("usb_temp_unlocked", false).apply()

                // Re-aplicar bloqueio USB
                try {
                    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    val adminComponent = android.content.ComponentName(context, com.mdm.launcher.DeviceAdminReceiver::class.java)
                    if (dpm.isDeviceOwnerApp(context.packageName)) {
                        dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_USB_FILE_TRANSFER)
                        dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_DEBUGGING_FEATURES)
                        try {
                            android.provider.Settings.Global.putInt(
                                context.contentResolver,
                                android.provider.Settings.Global.ADB_ENABLED,
                                0
                            )
                        } catch (_: Exception) {}
                        Log.d(TAG, "Bloqueio USB re-aplicado após desconectar")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao re-aplicar bloqueio USB: ${e.message}")
                }
            }
            return
        }

        // USB conectado - verificar se está bloqueado
        val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
        val usbBlocked = prefs.getBoolean("usb_blocked", false)
        val tempUnlocked = prefs.getBoolean("usb_temp_unlocked", false)

        Log.d(TAG, "USB conectado - bloqueado=$usbBlocked, tempUnlocked=$tempUnlocked")

        if (usbBlocked && !tempUnlocked) {
            Log.d(TAG, "USB bloqueado - abrindo tela de senha")
            val activityIntent = Intent(context, UsbUnlockActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(activityIntent)
        }
    }
}
