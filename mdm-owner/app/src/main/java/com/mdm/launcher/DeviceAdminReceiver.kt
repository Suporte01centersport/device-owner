package com.mdm.launcher

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class DeviceAdminReceiver : DeviceAdminReceiver() {
    
    companion object {
        private const val TAG = "DeviceAdminReceiver"
        const val EXTRA_DO_LOCKDOWN = "do_lockdown"
    }
    
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device Admin habilitado - disparando lockdown imediato")
        // Trazer MDM para frente e executar lockdown (parar downloads, matar apps, aplicar restrições)
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(EXTRA_DO_LOCKDOWN, true)
        }
        context.startActivity(launchIntent)
    }
    
    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d(TAG, "Device Admin desabilitado")
    }
    
    override fun onPasswordChanged(context: Context, intent: Intent, user: android.os.UserHandle) {
        super.onPasswordChanged(context, intent, user)
        Log.d(TAG, "Senha alterada")
    }
    
    override fun onPasswordFailed(context: Context, intent: Intent, user: android.os.UserHandle) {
        super.onPasswordFailed(context, intent, user)
        Log.d(TAG, "Tentativa de senha falhou")
    }
    
    override fun onPasswordSucceeded(context: Context, intent: Intent, user: android.os.UserHandle) {
        super.onPasswordSucceeded(context, intent, user)
        Log.d(TAG, "Senha correta inserida - tentando remover bloqueio de tela")
        // Após o usuário autenticar, o token de reset fica ativo → remove a senha imediatamente
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                val adminComponent = android.content.ComponentName(context, DeviceAdminReceiver::class.java)
                if (dpm.isDeviceOwnerApp(context.packageName)) {
                    com.mdm.launcher.utils.DevicePolicyHelper.clearPasswordWithPersistentToken(context, dpm, adminComponent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao remover senha após autenticação: ${e.message}")
            }
        }
    }
}
