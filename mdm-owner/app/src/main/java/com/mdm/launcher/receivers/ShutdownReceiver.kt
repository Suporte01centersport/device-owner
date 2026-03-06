package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.mdm.launcher.DeviceAdminReceiver

/**
 * Intercepta tentativa de desligar/reiniciar o dispositivo.
 * - Inicia a SIRENE (alarme) quando usuário aperta e segura o botão power e escolhe desligar/reiniciar
 * - Força reinício em vez de desligar (modo kiosk)
 *
 * NÃO dispara em: clique simples no power (bloquear/desbloquear tela) - isso é normal.
 * SÓ dispara em: apertar e segurar power → menu → desligar/reiniciar.
 *
 * IMPORTANTE: ACTION_SHUTDOWN é enviado no desligamento/reboot, NÃO no lock/unlock.
 * Se chamarmos reboot() durante um reboot que nós mesmos iniciamos, causa boot loop.
 */
class ShutdownReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ShutdownReceiver"
        const val PREF_LAST_REBOOT_INITIATED = "last_reboot_initiated"
        private const val REBOOT_COOLDOWN_MS = 120_000L // 2 min - evita loop durante nosso reboot
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_SHUTDOWN) return

        try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val lastReboot = prefs.getLong(PREF_LAST_REBOOT_INITIATED, 0L)
            val now = System.currentTimeMillis()

            // Se iniciamos um reboot recentemente, NÃO fazer nada (evita boot loop)
            if (lastReboot > 0 && (now - lastReboot) < REBOOT_COOLDOWN_MS) {
                Log.d(TAG, "Shutdown durante reboot nosso - ignorando (evita loop)")
                return
            }

            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager

            if (dpm.isDeviceOwnerApp(context.packageName)) {
                // 1. INICIAR SIRENE - tentativa não autorizada de desligar/reiniciar
                Log.w(TAG, "Tentativa de desligar/reiniciar detectada - INICIANDO SIRENE")
                try {
                    val alarmIntent = Intent(context, com.mdm.launcher.service.AlarmService::class.java).apply {
                        action = "START"
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(alarmIntent)
                    } else {
                        context.startService(alarmIntent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao iniciar sirene: ${e.message}")
                }

                // 2. Forçar REINÍCIO em vez de desligar (mantém dispositivo ligado)
                Log.w(TAG, "Forçando REINÍCIO em vez de desligar")
                val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
                dpm.reboot(adminComponent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar shutdown", e)
        }
    }
}
