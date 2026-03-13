package com.mdm.launcher

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.PersistableBundle
import android.util.Log
import com.mdm.launcher.utils.ServerDiscovery

class DeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "DeviceAdminReceiver"
        const val EXTRA_DO_LOCKDOWN = "do_lockdown"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device Admin habilitado")
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                // Já é Device Owner (não é provisioning QR) - lançar app
                Log.d(TAG, "Device Owner confirmado - lançando app")
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                context.startActivity(launchIntent)
            } else {
                // Provisionamento em andamento (QR/NFC) - aguardar onProfileProvisioningComplete
                Log.d(TAG, "Provisionamento em andamento - aguardando conclusão")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro em onEnabled: ${e.message}", e)
        }
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.d(TAG, "Provisionamento completo via QR Code!")

        // IMPORTANTE: Fazer o MÍNIMO aqui. O Android espera que este callback
        // retorne rápido e sem erros. Configurações pesadas ficam no MainActivity.onCreate.
        try {
            // 1. Salvar server_url dos extras do QR provisioning
            val extras = intent.getParcelableExtra<PersistableBundle>(
                DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE
            )
            val serverUrl = extras?.getString("server_url")
            if (!serverUrl.isNullOrBlank()) {
                Log.d(TAG, "server_url recebido do QR provisioning: $serverUrl")
                val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                prefs.edit()
                    .putString("server_url", serverUrl)
                    .putBoolean("provisioned_via_qr", true)
                    .apply()
                ServerDiscovery.saveDiscoveredServerUrl(context, serverUrl)
                ServerDiscovery.invalidateCache()
            }

            // 2. Habilitar perfil - APENAS para managed profile, NÃO para device owner
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                // Managed profile mode
                try {
                    dpm.setProfileEnabled(admin)
                    Log.d(TAG, "Perfil habilitado (managed profile)")
                } catch (e: Exception) {
                    Log.w(TAG, "setProfileEnabled falhou: ${e.message}")
                }
            } else {
                Log.d(TAG, "Device Owner mode - setProfileEnabled não necessário")
            }

            // 3. NÃO lançar MainActivity aqui - deixar o sistema Android completar o provisioning
            // O sistema vai abrir o app automaticamente após finalizar
            Log.d(TAG, "Provisionamento callback concluído com sucesso")

        } catch (e: Exception) {
            Log.e(TAG, "ERRO no provisionamento: ${e.message}", e)
            // Não fazer nada - deixar o Android lidar com o erro
        }
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
