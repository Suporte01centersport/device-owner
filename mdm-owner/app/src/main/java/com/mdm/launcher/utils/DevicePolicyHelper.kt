package com.mdm.launcher.utils

import android.content.ComponentName
import android.content.Context
import android.app.admin.DevicePolicyManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.mdm.launcher.DeviceAdminReceiver

/**
 * Helper para aplicar políticas de Device Owner.
 * Usado por MainActivity e WebSocketService.
 */
object DevicePolicyHelper {
    private const val TAG = "DevicePolicyHelper"

    fun applyDevicePolicies(context: Context): Boolean {
        return try {
            if (!isDeviceOwner(context)) {
                Log.w(TAG, "Não é Device Owner - políticas não aplicadas")
                return false
            }
            disableLockScreen(context)
            blockSettingsAccess(context)
            restrictQuickSettingsTiles(context)
            blockCredentialConfig(context)
            // Barra de status habilitada - usuário pode descer a aba para acessar WiFi e Bluetooth no Quick Settings
            showStatusBar(context)
            context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("device_policies_applied", true)
                .apply()
            Log.d(TAG, "✅ Políticas aplicadas com sucesso")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao aplicar políticas", e)
            false
        }
    }

    private fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    fun disableLockScreen(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)

            // Desabilitar lockscreen do sistema - tela fica só no cadeado MDM
            try {
                Settings.Secure.putInt(context.contentResolver, "lockscreen.disabled", 1)
            } catch (e: Exception) {
                try {
                    Settings.Secure.putInt(context.contentResolver, "lockscreen_disabled", 1)
                } catch (_: Exception) {}
            }

            // Remover senha/PIN/padrão - dispositivo sem credencial de desbloqueio
            try {
                dpm.setPasswordQuality(adminComponent, DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED)
                dpm.setPasswordMinimumLength(adminComponent, 0)
            } catch (_: Exception) {}

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    val token = ByteArray(32)
                    java.security.SecureRandom().nextBytes(token)
                    if (dpm.setResetPasswordToken(adminComponent, token)) {
                        dpm.resetPasswordWithToken(adminComponent, "", token, 0)
                    }
                } catch (_: Exception) {}
            }

            // Desabilitar keyguard (senha, PIN, padrão, fingerprint) - tela estática até desbloqueio web
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                try {
                    @Suppress("DEPRECATION")
                    dpm.setKeyguardDisabledFeatures(adminComponent, DevicePolicyManager.KEYGUARD_DISABLE_FEATURES_ALL)
                    Log.d(TAG, "Keyguard desabilitado - sem senha/PIN/padrão")
                } catch (e: Exception) {
                    Log.w(TAG, "setKeyguardDisabledFeatures: ${e.message}")
                }
            }
            Log.d(TAG, "Bloqueio de tela desabilitado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desabilitar bloqueio", e)
        }
    }

    fun blockSettingsAccess(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)

            try {
                dpm.setApplicationHidden(componentName, "com.android.settings", true)
                Log.d(TAG, "Settings oculto")
            } catch (e: Exception) {
                Log.w(TAG, "Não foi possível ocultar Settings: ${e.message}")
            }

            try {
                dpm.setApplicationHidden(componentName, "com.android.packageinstaller", true)
                Log.d(TAG, "Package Installer oculto")
            } catch (e: Exception) {
                Log.w(TAG, "Não foi possível ocultar Package Installer: ${e.message}")
            }

            try {
                dpm.addUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_SCREEN_TIMEOUT)
                // NÃO usar DISALLOW_CONFIG_BRIGHTNESS - usuário precisa do brilho no Quick Settings
            } catch (_: Exception) {}
            Log.d(TAG, "Bloqueio de configurações aplicado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao bloquear Settings", e)
        }
    }

    /**
     * Restringe Quick Settings a: brilho, wifi, bluetooth, lanterna.
     * Desabilita o lápis (editar) para impedir adicionar mais periféricos.
     * Data, horário e bateria ficam no header (barra de status).
     */
    fun restrictQuickSettingsTiles(context: Context) {
        try {
            // Apenas: brilho, wifi, bluetooth, lanterna (remove som e todo o resto)
            val tiles = "brightness,wifi,bt,flashlight"
            Settings.Secure.putString(context.contentResolver, "sysui_qs_tiles", tiles)
            Log.d(TAG, "Quick Settings restritos a: $tiles")

            // Desabilitar botão lápis (editar) - impede adicionar mais tiles
            try {
                Settings.Secure.putInt(context.contentResolver, "sysui_qs_edit", 0)
                Log.d(TAG, "Botão editar Quick Settings desabilitado")
            } catch (_: Exception) {}
            try {
                Settings.Secure.putInt(context.contentResolver, "qs_show_edit", 0)
                Log.d(TAG, "qs_show_edit desabilitado")
            } catch (_: Exception) {}
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    Settings.Global.putInt(context.contentResolver, "qs_edit_icon_visible", 0)
                    Log.d(TAG, "qs_edit_icon_visible desabilitado")
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao restringir Quick Settings: ${e.message}")
        }
    }

    /** Impede usuário de remover ou alterar PIN/senha do dispositivo */
    fun blockCredentialConfig(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                dpm.addUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_CREDENTIALS)
                Log.d(TAG, "Alteração de PIN/senha bloqueada")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao bloquear configuração de credenciais: ${e.message}")
        }
    }

    /** Oculta barra de status - remove notificações da vista (só web envia via app) */
    fun hideStatusBar(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                dpm.setStatusBarDisabled(adminComponent, true)
                Log.d(TAG, "Barra de status ocultada - notificações removidas da vista")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ocultar barra de status: ${e.message}")
        }
    }

    /** Exibe barra de status - permite descer a aba para acessar WiFi, Bluetooth e Quick Settings */
    fun showStatusBar(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                dpm.setStatusBarDisabled(adminComponent, false)
                Log.d(TAG, "Barra de status habilitada - WiFi e Bluetooth acessíveis via Quick Settings")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao habilitar barra de status: ${e.message}")
        }
    }
}
