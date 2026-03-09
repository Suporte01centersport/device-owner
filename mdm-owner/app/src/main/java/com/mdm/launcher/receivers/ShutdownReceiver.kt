package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Intercepta tentativa de desligar/reiniciar o dispositivo.
 * - Inicia a SIRENE (alarme) quando usuário aperta e segura o botão power e escolhe desligar/reiniciar
 *
 * NÃO dispara em: clique simples no power (bloquear/desbloquear tela) - isso é normal.
 * SÓ dispara em: apertar e segurar power → menu → desligar/reiniciar.
 *
 * IMPORTANTE: Não chamamos dpm.reboot() aqui - ACTION_SHUTDOWN é enviado tanto em shutdown quanto em reboot.
 * Se o usuário escolheu "reiniciar", o sistema já está reiniciando. Chamar reboot() de novo causa loop infinito.
 * Apenas iniciamos o alarme para alertar sobre a tentativa.
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
                // Sem sirene - apenas log da tentativa
                Log.w(TAG, "Tentativa de desligar/reiniciar detectada")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar shutdown", e)
        }
    }
}
