package com.mdm.launcher.receivers

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Bloqueia pareamento Bluetooth - APENAS dispositivos com "barcoder" no nome são permitidos.
 * Fones, caixas de som, celulares e qualquer outro dispositivo são bloqueados.
 */
class BluetoothPairingReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BluetoothPairingReceiver"

        /** Única palavra permitida no nome do dispositivo - deve conter "barcoder" */
        private const val ALLOWED_KEYWORD = "barcoder"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != BluetoothDevice.ACTION_PAIRING_REQUEST) return

        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        } ?: return

        if (!isAllowedDevice(device)) {
            Log.w(TAG, "Bloqueando pareamento: ${device.name} (${device.address}) - nome deve conter 'barcoder'")
            rejectPairing(device)
        }
    }

    /** Permite apenas dispositivos cujo nome contenha "barcoder" */
    private fun isAllowedDevice(device: BluetoothDevice): Boolean {
        val name = (device.name ?: "").lowercase()
        return name.contains(ALLOWED_KEYWORD)
    }

    private fun rejectPairing(device: BluetoothDevice) {
        try {
            device.javaClass.getMethod("setPairingConfirmation", Boolean::class.javaPrimitiveType)
                .invoke(device, false)
            Log.d(TAG, "Pareamento rejeitado via setPairingConfirmation(false)")
        } catch (e: Exception) {
            try {
                device.javaClass.getMethod("removeBond").invoke(device)
                Log.d(TAG, "Pareamento cancelado via removeBond()")
            } catch (e2: Exception) {
                Log.e(TAG, "Não foi possível rejeitar pareamento: ${e.message}")
            }
        }
    }
}
