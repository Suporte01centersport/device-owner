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
import com.mdm.launcher.data.DeviceRestrictions

/**
 * Helper para aplicar políticas de Device Owner.
 * Usado por MainActivity e WebSocketService.
 */
object DevicePolicyHelper {
    private const val TAG = "DevicePolicyHelper"
    /** Timeout de tela padrão: 5 minutos (em ms) - mantém tela ativa durante instalações */
    private const val SCREEN_TIMEOUT_MS = 5 * 60 * 1000

    /**
     * Configura Lock Task Features para modo quiosque.
     * Permite: status bar (info), notificações (Quick Settings para WiFi/Bluetooth), global actions.
     * Deve ser chamado ANTES de startLockTask() quando queremos que o usuário acesse Quick Settings.
     */
    fun enableLockTaskWithStatusBar(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return

            // LOCK_TASK_FEATURE_SYSTEM_INFO = 1 (status bar com hora, bateria, etc.)
            // LOCK_TASK_FEATURE_NOTIFICATIONS = 2 (puxar barra de notificações - Quick Settings)
            // LOCK_TASK_FEATURE_HOME = 4 (botão home)
            // LOCK_TASK_FEATURE_GLOBAL_ACTIONS = 16 (menu power longo) - REMOVIDO para impedir desligar/reiniciar
            val features = DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO or
                DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS or
                DevicePolicyManager.LOCK_TASK_FEATURE_HOME
            dpm.setLockTaskFeatures(adminComponent, features)
            Log.d(TAG, "Lock Task Features configurados: statusBar + notificações + home (sem globalActions - menu power bloqueado)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao configurar Lock Task Features: ${e.message}")
        }
    }

    /**
     * Configura Lock Task Features para tela de bloqueio (sem nenhum recurso).
     * Impede: status bar, notificações, home, recentes - dispositivo totalmente travado.
     */
    fun disableLockTaskFeatures(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return
            // LOCK_TASK_FEATURE_NONE = 0 (bloqueia tudo)
            dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            Log.d(TAG, "Lock Task Features desabilitados (tela de bloqueio)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desabilitar Lock Task Features: ${e.message}")
        }
    }

    /** Libera WiFi e Bluetooth - permite ligar/desligar pelos tiles do Quick Settings. NÃO desbloqueia Settings. */
    fun liberateWifiBluetooth(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return
            dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_WIFI)
            dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
            // NÃO desocultar Settings - os tiles de WiFi/BT funcionam sem o app Settings visível
            // Manter Settings oculto para impedir acesso via engrenagem na barra de notificações
            Log.d(TAG, "WiFi e Bluetooth liberados (Settings permanece oculto)")
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
            // PRIMEIRO: Habilitar barra de status ANTES de tudo
            showStatusBar(context)
            liberateWifiBluetooth(context)
            disableLockScreen(context)
            setScreenTimeout(context, SCREEN_TIMEOUT_MS)
            // Settings: verificar restrição salva antes de bloquear
            val savedRestrictions = context.getSharedPreferences("mdm_restrictions", Context.MODE_PRIVATE)
                .getString("restrictions_json", null)
            val settingsBlocked = if (savedRestrictions != null) {
                try { org.json.JSONObject(savedRestrictions).optBoolean("settingsDisabled", true) } catch (_: Exception) { true }
            } else true
            if (settingsBlocked) {
                blockSettingsAccess(context)
            } else {
                Log.d(TAG, "Settings liberado conforme restrições salvas")
            }
            restrictQuickSettingsTiles(context)
            blockCredentialConfig(context)
            // Habilitar status bar + Quick Settings no Lock Task Mode (WiFi/Bluetooth acessíveis)
            enableLockTaskWithStatusBar(context)
            // Auto-conceder acesso ao NotificationListener (sem prompt ao usuário) - bloqueia notificações de outros apps
            autoGrantNotificationListenerAccess(context)
            // Abrir configurações de acessibilidade para o WmsAccessibilityService (captura erros HTTP/HTTPS do WMS)
            promptAccessibilityServiceIfNeeded(context)
            // POR ÚLTIMO: Habilitar barra de status NOVAMENTE (garante que nenhuma política acima desabilitou)
            showStatusBar(context)
            context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("device_policies_applied", true)
                .apply()
            Log.d(TAG, "✅ Políticas aplicadas com sucesso (barra de status habilitada)")
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

            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                Log.w(TAG, "Não é Device Owner - não pode desabilitar lockscreen")
                return
            }

            // 1. Desabilitar keyguard completamente (API 28+ / Android 9+)
            // Esta é a forma definitiva - desativa PIN, senha, padrão, biometria
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    dpm.setKeyguardDisabled(adminComponent, true)
                    Log.d(TAG, "setKeyguardDisabled(true) - lockscreen completamente desabilitado")
                } catch (e: Exception) {
                    Log.w(TAG, "setKeyguardDisabled falhou: ${e.message}")
                }
            }

            // 2. Desabilitar features do keyguard (fallback para APIs mais antigas)
            try {
                @Suppress("DEPRECATION")
                dpm.setKeyguardDisabledFeatures(adminComponent, DevicePolicyManager.KEYGUARD_DISABLE_FEATURES_ALL)
                Log.d(TAG, "Keyguard features desabilitadas")
            } catch (e: Exception) {
                Log.w(TAG, "setKeyguardDisabledFeatures: ${e.message}")
            }

            // 3. Remover exigência de senha por política MDM
            try {
                @Suppress("DEPRECATION")
                dpm.setPasswordQuality(adminComponent, DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED)
                dpm.setPasswordMinimumLength(adminComponent, 0)
            } catch (_: Exception) {}

            // 4. Limpar senha existente com token
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                clearPasswordWithPersistentToken(context, dpm, adminComponent)
            }

            // 5. Tentar resetPassword direto (deprecated mas funciona em alguns dispositivos)
            try {
                @Suppress("DEPRECATION")
                dpm.resetPassword("", 0)
                Log.d(TAG, "resetPassword('') executado")
            } catch (_: Exception) {}

            // 6. Settings.Secure para desabilitar lockscreen
            try {
                Settings.Secure.putInt(context.contentResolver, "lockscreen.disabled", 1)
            } catch (_: Exception) {
                try {
                    Settings.Secure.putInt(context.contentResolver, "lockscreen_disabled", 1)
                } catch (_: Exception) {}
            }

            Log.d(TAG, "Bloqueio de tela desabilitado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desabilitar bloqueio", e)
        }
    }

    /**
     * Usa um token persistente para remover a senha do dispositivo.
     * - Se o token ainda não existe, gera e persiste um novo.
     * - Se o token já está ativo (usuário autenticou uma vez), remove a senha imediatamente.
     * - Se o token não está ativo ainda (dispositivo tem senha existente), aguarda o usuário
     *   autenticar uma vez; após isso, DeviceAdminReceiver.onPasswordSucceeded chama este método
     *   novamente e a senha é removida.
     */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.N)
    fun clearPasswordWithPersistentToken(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName
    ) {
        try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val tokenKey = "reset_password_token"

            // Recuperar ou gerar token persistente
            val existingTokenHex = prefs.getString(tokenKey, null)
            val token: ByteArray = if (existingTokenHex != null) {
                hexToBytes(existingTokenHex)
            } else {
                val newToken = ByteArray(32)
                java.security.SecureRandom().nextBytes(newToken)
                prefs.edit().putString(tokenKey, bytesToHex(newToken)).apply()
                newToken
            }

            // Registrar token no sistema (idempotente - OK chamar várias vezes)
            val tokenSet = dpm.setResetPasswordToken(adminComponent, token)
            Log.d(TAG, "Token de reset definido: $tokenSet")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val isActive = dpm.isResetPasswordTokenActive(adminComponent)
                Log.d(TAG, "Token ativo: $isActive")
                if (isActive) {
                    val cleared = dpm.resetPasswordWithToken(adminComponent, "", token, 0)
                    Log.d(TAG, "Senha removida com token persistente: $cleared")
                } else {
                    Log.d(TAG, "Token não ativo ainda - senha será removida após o usuário autenticar uma vez")
                }
            } else {
                // API 24-25: tenta direto (funciona se não há senha ou token já foi ativado)
                try {
                    dpm.resetPasswordWithToken(adminComponent, "", token, 0)
                    Log.d(TAG, "Senha removida (API 24-25)")
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar senha com token: ${e.message}")
        }
    }

    private fun bytesToHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    private fun hexToBytes(hex: String): ByteArray =
        ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

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
            if (!dpm.isDeviceOwnerApp(context.packageName)) return

            liberateWifiBluetooth(context)

            // Ocultar Settings para impedir acesso via engrenagem na barra de notificações
            for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                try { dpm.setApplicationHidden(componentName, pkg, true) } catch (_: Exception) {}
            }

            try {
                dpm.addUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_SCREEN_TIMEOUT)
            } catch (_: Exception) {}
            Log.d(TAG, "Bloqueio de configurações aplicado (Settings oculto)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao bloquear Settings", e)
        }
    }

    /** Libera WiFi e Bluetooth temporariamente - sem exibir Settings */
    fun temporarilyAllowWifiBluetoothConfig(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                dpm.clearUserRestriction(componentName, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
                // NÃO exibir Settings - tiles WiFi/BT funcionam sem o app Settings
                context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                    .edit().putBoolean("wifi_bluetooth_panel_open", true).apply()
                Log.d(TAG, "WiFi/Bluetooth liberados temporariamente (Settings permanece oculto)")
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

    /** Reoculta Settings após uso temporário */
    fun rehideSettings(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return
            for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                try { dpm.setApplicationHidden(componentName, pkg, true) } catch (_: Exception) {}
            }
            Log.d(TAG, "Settings reoculto")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao reocultar Settings: ${e.message}")
        }
    }

    /**
     * Restringe Quick Settings a: brilho, wifi, bluetooth, lanterna.
     * Bloqueia: engrenagem (settings), lápis (editar), power, conta de usuário.
     * Data, horário e bateria ficam no header (barra de status).
     */
    fun restrictQuickSettingsTiles(context: Context) {
        try {
            // Apenas: brilho, wifi, bluetooth, lanterna (remove som e todo o resto)
            val tiles = "brightness,wifi,bt,flashlight"
            Settings.Secure.putString(context.contentResolver, "sysui_qs_tiles", tiles)
            Log.d(TAG, "Quick Settings restritos a: $tiles")

            // Desabilitar botão lápis (editar) - impede adicionar mais tiles
            try { Settings.Secure.putInt(context.contentResolver, "sysui_qs_edit", 0) } catch (_: Exception) {}
            try { Settings.Secure.putInt(context.contentResolver, "qs_show_edit", 0) } catch (_: Exception) {}

            // Desabilitar engrenagem (Settings) no header dos Quick Settings
            try { Settings.Secure.putInt(context.contentResolver, "qs_show_settings", 0) } catch (_: Exception) {}
            // Esconder ícone de conta/usuário no header
            try { Settings.Secure.putInt(context.contentResolver, "qs_show_user", 0) } catch (_: Exception) {}
            try { Settings.Secure.putInt(context.contentResolver, "sysui_qs_user_detail", 0) } catch (_: Exception) {}
            // Esconder botão power no Quick Settings
            try { Settings.Secure.putInt(context.contentResolver, "qs_show_power", 0) } catch (_: Exception) {}
            try { Settings.Global.putInt(context.contentResolver, "power_menu_disabled", 1) } catch (_: Exception) {}

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try { Settings.Global.putInt(context.contentResolver, "qs_edit_icon_visible", 0) } catch (_: Exception) {}
            }
            Log.d(TAG, "Quick Settings restritos: tiles=$tiles, engrenagem/lápis/power/usuário bloqueados")
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

    /**
     * Auto-concede acesso ao MdmNotificationListenerService diretamente via Settings.Secure.
     * Como Device Owner, temos WRITE_SECURE_SETTINGS — sem necessidade de prompt ao usuário.
     * Chama rebindNotificationListenerService() para ativar imediatamente sem reiniciar.
     */
    fun autoGrantNotificationListenerAccess(context: Context) {
        try {
            val listenerComponent = "${context.packageName}/com.mdm.launcher.service.MdmNotificationListenerService"
            val current = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            if (!current.contains(listenerComponent)) {
                val updated = if (current.isBlank()) listenerComponent else "$current:$listenerComponent"
                Settings.Secure.putString(
                    context.contentResolver,
                    "enabled_notification_listeners",
                    updated
                )
                Log.d(TAG, "✅ Notification Listener auto-concedido: $listenerComponent")
            } else {
                Log.d(TAG, "Notification Listener já habilitado")
            }
            // Notificar o sistema para recarregar a lista de listeners imediatamente
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                    val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
                    if (dpm.isDeviceOwnerApp(context.packageName)) {
                        dpm.setPermittedAccessibilityServices(adminComponent, null) // Permitir todos
                        Log.d(TAG, "✅ Notification Listener configurado via Settings.Secure (API 31+)")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Configuração adicional de Notification Listener não disponível: ${e.message}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao auto-conceder notification listener: ${e.message}")
        }
    }

    /** Abre configurações de acessibilidade para habilitar WmsAccessibilityService (captura erros HTTP/HTTPS do WMS) */
    fun promptAccessibilityServiceIfNeeded(context: Context) {
        try {
            val serviceName = "${context.packageName}/com.mdm.launcher.service.WmsAccessibilityService"
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )?.contains(serviceName) == true
            if (!enabled) {
                val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                if (!prefs.getBoolean("accessibility_prompted", false)) {
                    prefs.edit().putBoolean("accessibility_prompted", true).apply()
                    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    Log.d(TAG, "Abrindo configurações de acessibilidade para WmsAccessibilityService")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de acessibilidade: ${e.message}")
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
                // Desabilitar bloqueio da barra de status (false = permite puxar)
                dpm.setStatusBarDisabled(adminComponent, false)
                // Liberar WiFi e Bluetooth (caso tenha sido bloqueado)
                dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_WIFI)
                dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH)
                Log.d(TAG, "✅ BARRA DE STATUS HABILITADA - setStatusBarDisabled(false) + WiFi/BT liberados")
            } else {
                Log.w(TAG, "⚠️ showStatusBar: NÃO é Device Owner - não pode alterar")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao habilitar barra de status: ${e.message}", e)
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

    /**
     * Aplica todas as restrições remotas recebidas do servidor MDM.
     * Usa DevicePolicyManager para configurar restrições de UserManager, câmera, captura de tela, etc.
     * Persiste as restrições em SharedPreferences para reaplicar após reboot.
     */
    fun applyRemoteRestrictions(context: Context, restrictions: DeviceRestrictions) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) return

            // Helper to set/clear restriction
            fun setRestriction(restriction: String, disabled: Boolean) {
                try {
                    if (disabled) dpm.addUserRestriction(adminComponent, restriction)
                    else dpm.clearUserRestriction(adminComponent, restriction)
                } catch (e: Exception) {
                    Log.w(TAG, "Restriction $restriction: ${e.message}")
                }
            }

            // Camera
            try { dpm.setCameraDisabled(adminComponent, restrictions.cameraDisabled) } catch (_: Exception) {}

            // Screen capture
            try { dpm.setScreenCaptureDisabled(adminComponent, restrictions.screenCaptureDisabled) } catch (_: Exception) {}

            // Status bar
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try { dpm.setStatusBarDisabled(adminComponent, restrictions.statusBarDisabled) } catch (_: Exception) {}
            }

            // UserManager restrictions mapping
            setRestriction(android.os.UserManager.DISALLOW_CONFIG_WIFI, restrictions.wifiDisabled)
            setRestriction(android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH, restrictions.bluetoothDisabled)
            // Sempre limpar DISALLOW_BLUETOOTH - o filtro de pareamento é feito pelo BluetoothPairingReceiver
            setRestriction(android.os.UserManager.DISALLOW_BLUETOOTH, false)
            setRestriction(android.os.UserManager.DISALLOW_INSTALL_APPS, restrictions.installAppsDisabled)
            setRestriction(android.os.UserManager.DISALLOW_UNINSTALL_APPS, restrictions.uninstallAppsDisabled)
            setRestriction(android.os.UserManager.DISALLOW_SHARE_LOCATION, restrictions.sharingDisabled)
            setRestriction(android.os.UserManager.DISALLOW_OUTGOING_CALLS, restrictions.outgoingCallsDisabled)
            setRestriction(android.os.UserManager.DISALLOW_SMS, restrictions.smsDisabled)
            setRestriction(android.os.UserManager.DISALLOW_CREATE_WINDOWS, restrictions.userCreationDisabled)
            setRestriction(android.os.UserManager.DISALLOW_REMOVE_USER, restrictions.userRemovalDisabled)

            // NEW restrictions
            setRestriction(android.os.UserManager.DISALLOW_FACTORY_RESET, restrictions.factoryResetDisabled)
            setRestriction(android.os.UserManager.DISALLOW_ADD_USER, restrictions.addAccountDisabled)
            setRestriction(android.os.UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA, restrictions.externalStorageDisabled)
            setRestriction(android.os.UserManager.DISALLOW_USB_FILE_TRANSFER, restrictions.usbDisabled)
            setRestriction(android.os.UserManager.DISALLOW_DEBUGGING_FEATURES, restrictions.developerOptionsDisabled)
            setRestriction(android.os.UserManager.DISALLOW_CONFIG_TETHERING, restrictions.hotspotDisabled)
            setRestriction(android.os.UserManager.DISALLOW_AIRPLANE_MODE, restrictions.airplaneModeDisabled)
            setRestriction(android.os.UserManager.DISALLOW_CONFIG_LOCATION, restrictions.locationDisabled)
            setRestriction(android.os.UserManager.DISALLOW_MODIFY_ACCOUNTS, restrictions.addAccountDisabled)

            // NFC
            if (restrictions.nfcDisabled) {
                setRestriction(android.os.UserManager.DISALLOW_OUTGOING_BEAM, true)
            }

            // Bluetooth pairing - NÃO usar DISALLOW_BLUETOOTH pois bloqueia tudo (ligar/desligar/config)
            // O filtro de pareamento é feito pelo BluetoothPairingReceiver no manifest
            // que só permite dispositivos com "barcoder" no nome
            // Aqui apenas garantimos que o Bluetooth fique LIBERADO para uso
            if (restrictions.bluetoothPairingDisabled) {
                // Liberar Bluetooth (ligar/desligar e configurações)
                setRestriction(android.os.UserManager.DISALLOW_BLUETOOTH, false)
                setRestriction(android.os.UserManager.DISALLOW_CONFIG_BLUETOOTH, false)
                Log.d(TAG, "Bluetooth liberado - pareamento filtrado pelo BluetoothPairingReceiver (só 'barcoder')")
            }

            // Auto time
            if (restrictions.autoTimeRequired) {
                try { dpm.setAutoTimeRequired(adminComponent, true) } catch (_: Exception) {}
            }

            // Settings access
            if (restrictions.settingsDisabled) {
                blockSettingsAccess(context)
            } else {
                // Desfazer bloqueio - mostrar Settings novamente
                for (pkg in arrayOf("com.android.settings", "com.coloros.settings", "com.oppo.settings", "com.samsung.android.settings")) {
                    try { dpm.setApplicationHidden(adminComponent, pkg, false) } catch (_: Exception) {}
                }
                try { dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_CONFIG_SCREEN_TIMEOUT) } catch (_: Exception) {}
                Log.d(TAG, "Settings desbloqueado")
            }

            // System notifications - block via status bar notifications
            if (restrictions.systemNotificationsDisabled) {
                try { dpm.setPermittedAccessibilityServices(adminComponent, listOf()) } catch (_: Exception) {}
            }

            // Save to SharedPreferences for reboot persistence
            val prefs = context.getSharedPreferences("mdm_restrictions", Context.MODE_PRIVATE)
            val json = org.json.JSONObject().apply {
                put("wifiDisabled", restrictions.wifiDisabled)
                put("bluetoothDisabled", restrictions.bluetoothDisabled)
                put("cameraDisabled", restrictions.cameraDisabled)
                put("statusBarDisabled", restrictions.statusBarDisabled)
                put("installAppsDisabled", restrictions.installAppsDisabled)
                put("uninstallAppsDisabled", restrictions.uninstallAppsDisabled)
                put("settingsDisabled", restrictions.settingsDisabled)
                put("systemNotificationsDisabled", restrictions.systemNotificationsDisabled)
                put("screenCaptureDisabled", restrictions.screenCaptureDisabled)
                put("sharingDisabled", restrictions.sharingDisabled)
                put("outgoingCallsDisabled", restrictions.outgoingCallsDisabled)
                put("smsDisabled", restrictions.smsDisabled)
                put("userCreationDisabled", restrictions.userCreationDisabled)
                put("userRemovalDisabled", restrictions.userRemovalDisabled)
                put("nfcDisabled", restrictions.nfcDisabled)
                put("usbDisabled", restrictions.usbDisabled)
                put("developerOptionsDisabled", restrictions.developerOptionsDisabled)
                put("factoryResetDisabled", restrictions.factoryResetDisabled)
                put("hotspotDisabled", restrictions.hotspotDisabled)
                put("locationDisabled", restrictions.locationDisabled)
                put("airplaneModeDisabled", restrictions.airplaneModeDisabled)
                put("addAccountDisabled", restrictions.addAccountDisabled)
                put("externalStorageDisabled", restrictions.externalStorageDisabled)
                put("autoTimeRequired", restrictions.autoTimeRequired)
                put("bluetoothPairingDisabled", restrictions.bluetoothPairingDisabled)
                put("lockScreen", restrictions.lockScreen)
                put("kioskMode", restrictions.kioskMode)
            }
            prefs.edit().putString("saved_restrictions", json.toString()).apply()

            Log.d(TAG, "Restricoes remotas aplicadas e salvas")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao aplicar restricoes remotas: ${e.message}", e)
        }
    }

    /**
     * Recarrega e reaplica as restrições salvas em SharedPreferences.
     * Chamado pelo SystemBootReceiver após BOOT_COMPLETED para garantir persistência.
     */
    fun loadAndApplySavedRestrictions(context: Context) {
        try {
            val prefs = context.getSharedPreferences("mdm_restrictions", Context.MODE_PRIVATE)
            val json = prefs.getString("saved_restrictions", null) ?: return
            val obj = org.json.JSONObject(json)
            val restrictions = DeviceRestrictions(
                wifiDisabled = obj.optBoolean("wifiDisabled", false),
                bluetoothDisabled = obj.optBoolean("bluetoothDisabled", false),
                cameraDisabled = obj.optBoolean("cameraDisabled", false),
                statusBarDisabled = obj.optBoolean("statusBarDisabled", false),
                installAppsDisabled = obj.optBoolean("installAppsDisabled", false),
                uninstallAppsDisabled = obj.optBoolean("uninstallAppsDisabled", false),
                settingsDisabled = obj.optBoolean("settingsDisabled", false),
                systemNotificationsDisabled = obj.optBoolean("systemNotificationsDisabled", false),
                screenCaptureDisabled = obj.optBoolean("screenCaptureDisabled", false),
                sharingDisabled = obj.optBoolean("sharingDisabled", false),
                outgoingCallsDisabled = obj.optBoolean("outgoingCallsDisabled", false),
                smsDisabled = obj.optBoolean("smsDisabled", false),
                userCreationDisabled = obj.optBoolean("userCreationDisabled", false),
                userRemovalDisabled = obj.optBoolean("userRemovalDisabled", false),
                nfcDisabled = obj.optBoolean("nfcDisabled", false),
                usbDisabled = obj.optBoolean("usbDisabled", false),
                developerOptionsDisabled = obj.optBoolean("developerOptionsDisabled", false),
                factoryResetDisabled = obj.optBoolean("factoryResetDisabled", false),
                hotspotDisabled = obj.optBoolean("hotspotDisabled", false),
                locationDisabled = obj.optBoolean("locationDisabled", false),
                airplaneModeDisabled = obj.optBoolean("airplaneModeDisabled", false),
                addAccountDisabled = obj.optBoolean("addAccountDisabled", false),
                externalStorageDisabled = obj.optBoolean("externalStorageDisabled", false),
                lockScreen = obj.optBoolean("lockScreen", false),
                kioskMode = obj.optBoolean("kioskMode", false),
                bluetoothPairingDisabled = obj.optBoolean("bluetoothPairingDisabled", false),
                autoTimeRequired = obj.optBoolean("autoTimeRequired", false)
            )
            applyRemoteRestrictions(context, restrictions)
            Log.d(TAG, "Restricoes salvas recarregadas apos boot")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao recarregar restricoes: ${e.message}")
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
            // Bloquear tudo na tela de bloqueio (sem status bar, sem notificações)
            disableLockTaskFeatures(context)
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
