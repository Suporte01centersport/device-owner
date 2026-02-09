package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AppChangeReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "AppChangeReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        val packageName = intent.data?.schemeSpecificPart
        Log.d(TAG, "Mudança de pacote detectada: ${intent.action} -> $packageName")
        
        // Solicitar atualização de status do dispositivo
        val serviceIntent = Intent(context, com.mdm.launcher.service.::class.java).apply {
            action = "com.mdm.launcher.SEND_DEVICE_STATUS"
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}


