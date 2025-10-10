package com.mdm.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AppChangeReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "AppChangeReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_PACKAGE_ADDED -> {
                val packageName = intent.data?.schemeSpecificPart
                Log.d(TAG, "App instalado: $packageName")
                // Notificar servidor sobre nova instalação
                notifyServerAboutAppChange(context, "installed", packageName)
            }
            Intent.ACTION_PACKAGE_REMOVED -> {
                val packageName = intent.data?.schemeSpecificPart
                Log.d(TAG, "App removido: $packageName")
                // Notificar servidor sobre remoção
                notifyServerAboutAppChange(context, "removed", packageName)
            }
            Intent.ACTION_PACKAGE_REPLACED -> {
                val packageName = intent.data?.schemeSpecificPart
                Log.d(TAG, "App atualizado: $packageName")
                // Notificar servidor sobre atualização
                notifyServerAboutAppChange(context, "updated", packageName)
            }
        }
    }
    
    private fun notifyServerAboutAppChange(context: Context, action: String, packageName: String?) {
        if (packageName == null) return
        
        // Iniciar serviço WebSocket se não estiver rodando
        val serviceIntent = Intent(context, com.mdm.launcher.service.WebSocketService::class.java)
        context.startForegroundService(serviceIntent)
        
        // Aqui você pode adicionar lógica para notificar o servidor
        // sobre mudanças nos apps instalados
        Log.d(TAG, "Notificando servidor: $action - $packageName")
    }
}
