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

            try {
                Settings.Secure.putInt(context.contentResolver, "lockscreen.disabled", 1)
            } catch (e: Exception) {
                try {
                    Settings.Secure.putInt(context.contentResolver, "lockscreen_disabled", 1)
                } catch (_: Exception) {}
            }

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
                dpm.addUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_BRIGHTNESS)
            } catch (_: Exception) {}
            Log.d(TAG, "Bloqueio de configurações aplicado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao bloquear Settings", e)
        }
    }

    fun restrictQuickSettingsTiles(context: Context) {
        try {
            val tiles = "wifi,bt,brightness,sound,flashlight"
            Settings.Secure.putString(context.contentResolver, "sysui_qs_tiles", tiles)
            Log.d(TAG, "Quick Settings restritos a: $tiles")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao restringir Quick Settings: ${e.message}")
        }
    }
}
