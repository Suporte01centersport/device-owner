package com.mdm.launcher.utils

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.content.pm.PackageManager
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
    /** Timeout de tela padrão: 5 minutos (em ms) - mantém tela ativa durante instalações */
    private const val SCREEN_TIMEOUT_MS = 5 * 60 * 1000

    /** Libera WiFi e Bluetooth - permite abrir ao segurar nos tiles do Quick Settings. Chamar sempre que aplicar políticas. */
    fun liberateWifiBluetooth(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return
            dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_WIFI)
            dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
            for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                try { dpm.setApplicationHidden(componentName, pkg, false) } catch (_: Exception) {}
            }
            Log.d(TAG, "WiFi e Bluetooth liberados")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar WiFi/Bluetooth: ${e.message}")
        }
    }

    fun applyDevicePolicies(context: Context): Boolean {
        return try {
            if (!isDeviceOwner(context)) {
                Log.w(TAG, "Não é Device Owner - políticas não aplicadas")
                return false
            }
            liberateWifiBluetooth(context)
            disableLockScreen(context)
            setScreenTimeout(context, SCREEN_TIMEOUT_MS)
            blockSettingsAccess(context)
            restrictQuickSettingsTiles(context)
            blockCredentialConfig(context)
            // Barra de status habilitada - usuário pode descer a aba para acessar WiFi e Bluetooth no Quick Settings
            showStatusBar(context)
            // Abrir configurações de acesso a notificações (necessário para bloquear notificações de outros apps)
            promptNotificationAccessIfNeeded(context)
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

    /** Define timeout de tela (ex: 5 min para manter ativa durante instalações) */
    private fun setScreenTimeout(context: Context, timeoutMs: Int) {
        try {
            Settings.System.putInt(
                context.contentResolver,
                Settings.System.SCREEN_OFF_TIMEOUT,
                timeoutMs
            )
            Log.d(TAG, "Timeout de tela definido: ${timeoutMs / 1000}s (${timeoutMs / 60000} min)")
        } catch (e: Exception) {
            Log.w(TAG, "Não foi possível definir timeout de tela: ${e.message}")
        }
    }

    /** Aplica timeout de 5 minutos - pode ser chamado a qualquer momento para garantir */
    fun applyFiveMinuteScreenTimeout(context: Context) {
        if (isDeviceOwner(context)) {
            setScreenTimeout(context, SCREEN_TIMEOUT_MS)
        }
    }

    fun blockSettingsAccess(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)

            liberateWifiBluetooth(context)

            try {
                dpm.addUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_SCREEN_TIMEOUT)
                // Impede usuário alterar - MDM mantém 5 min como padrão
            } catch (_: Exception) {}
            Log.d(TAG, "Bloqueio de configurações aplicado (Settings visível para WiFi/Bluetooth)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao bloquear Settings", e)
        }
    }

    /** Libera WiFi e Bluetooth temporariamente - segurar botão config para adicionar dispositivos */
    fun temporarilyAllowWifiBluetoothConfig(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
                // Exibir Settings - incluir pacotes de fabricantes (Realme/OPPO/Samsung)
                for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                    try {
                        dpm.setApplicationHidden(componentName, pkg, false)
                        Log.d(TAG, "Settings exibido: $pkg")
                    } catch (_: Exception) {}
                }
                context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                    .edit().putBoolean("wifi_bluetooth_panel_open", true).apply()
                Log.d(TAG, "WiFi/Bluetooth liberados temporariamente (segurar config)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar WiFi/Bluetooth: ${e.message}")
        }
    }

    /** Limpa flag ao voltar do painel config (Settings permanece visível para WiFi/Bluetooth) */
    fun reapplyWifiBluetoothRestrictions(context: Context) {
        try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("wifi_bluetooth_panel_open", false)) return
            prefs.edit().putBoolean("wifi_bluetooth_panel_open", false).apply()
            // NÃO reocultar Settings - permite abrir WiFi/Bluetooth ao segurar nos tiles
            Log.d(TAG, "Flag wifi_bluetooth_panel_open limpa")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao reaplicar restrições: ${e.message}")
        }
    }

    /** Temporariamente exibe Settings para abrir painéis WiFi/Bluetooth (mini tela) */
    fun temporarilyShowSettingsForPanel(context: Context) {
        temporarilyAllowWifiBluetoothConfig(context)
    }

    /** Não reoculta Settings - mantém visível para WiFi/Bluetooth no Quick Settings */
    fun rehideSettings(context: Context) {
        // Settings permanece visível para permitir abrir painéis WiFi/Bluetooth ao segurar nos tiles
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

    /** Abre configurações para habilitar acesso a notificações (bloquear notificações de outros apps) */
    fun promptNotificationAccessIfNeeded(context: Context) {
        try {
            val enabled = android.provider.Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            )?.contains(context.packageName) == true
            if (!enabled) {
                val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                if (!prefs.getBoolean("notification_access_prompted", false)) {
                    prefs.edit().putBoolean("notification_access_prompted", true).apply()
                    val intent = android.content.Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    Log.d(TAG, "Abrindo configurações de acesso a notificações")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de notificação: ${e.message}")
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

    /**
     * Lockdown imediato ao instalar MDM como Device Owner.
     * - Bloqueia downloads/instalações de apps (Play Store, etc.)
     * - Para todos os apps em execução
     * - Aplica restrições e políticas do MDM
     */
    fun performLockdownOnInstall(context: Context) {
        try {
            if (!isDeviceOwner(context)) {
                Log.w(TAG, "Não é Device Owner - lockdown ignorado")
                return
            }
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            val mdmPackage = context.packageName

            Log.d(TAG, "🔒 LOCKDOWN: Iniciando bloqueio imediato ao instalar MDM")

            liberateWifiBluetooth(context)

            // Timeout de tela: 5 minutos (padrão para instalações)
            setScreenTimeout(context, SCREEN_TIMEOUT_MS)

            // Remover restrições de instalação (permite atualizações do MDM e outros apps)
            try {
                dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_INSTALL_APPS)
                dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES)
                Log.d(TAG, "Restrições de instalação removidas/liberadas")
            } catch (_: Exception) {}

            // Aplicar restrições (sem WiFi/Bluetooth - permite abrir ao segurar nos tiles do Quick Settings)
            val restrictions = listOf(
                android.os.UserManager.DISALLOW_FACTORY_RESET,
                android.os.UserManager.DISALLOW_ADD_USER,
                android.os.UserManager.DISALLOW_CONFIG_CREDENTIALS,
                android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS,
                android.os.UserManager.DISALLOW_REMOVE_USER,
                android.os.UserManager.DISALLOW_UNINSTALL_APPS,
                android.os.UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS
            )
            for (r in restrictions) {
                try { dpm.addUserRestriction(componentName, r) } catch (_: Exception) {}
            }
            Log.d(TAG, "🔒 Restrições de Device Owner aplicadas")

            // 3. Aplicar políticas (Settings oculto, Quick Settings, etc.)
            applyDevicePolicies(context)

            // 4. Parar todos os apps em execução (exceto MDM e sistema)
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val pm = context.packageManager
            val packages = pm.getInstalledPackages(PackageManager.GET_META_DATA)
            val systemPackages = setOf(
                "android", "com.android.systemui", "com.android.settings",
                "com.google.android.gms", "com.android.phone", mdmPackage
            )
            for (pkg in packages) {
                val pkgName = pkg.packageName
                if (pkgName == mdmPackage || systemPackages.any { pkgName.startsWith(it) }) continue
                if ((pkg.applicationInfo?.flags ?: 0) and android.content.pm.ApplicationInfo.FLAG_SYSTEM != 0) continue
                try {
                    am.killBackgroundProcesses(pkgName)
                } catch (_: Exception) {}
            }
            Log.d(TAG, "🔒 Lockdown concluído - apenas permissões do MDM ativas")
        } catch (e: Exception) {
            Log.e(TAG, "Erro no lockdown: ${e.message}", e)
        }
    }

    /** Mostra tela de cadeado sem iniciar sirene (para botões que não sejam power) */
    fun showLockScreenOnly(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(context.packageName)) return
            disableLockScreen(context)
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            try {
                dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
            } catch (e: Exception) {
                Log.w(TAG, "setLockTaskPackages falhou: ${e.message}")
            }
            val lockIntent = Intent(context, com.mdm.launcher.LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_HISTORY or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
            }
            context.startActivity(lockIntent)
            Log.d(TAG, "Tela de bloqueio iniciada (sem sirene - botão não-power)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao mostrar tela de bloqueio: ${e.message}")
        }
    }
}
