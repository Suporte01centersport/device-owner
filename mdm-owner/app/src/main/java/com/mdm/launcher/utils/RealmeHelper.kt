package com.mdm.launcher.utils

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Helper para lidar com restrições específicas da Realme/ColorOS
 */
object RealmeHelper {
    private const val TAG = "RealmeHelper"

    /**
     * Verifica se o dispositivo é Realme/ColorOS
     */
    fun isRealmeDevice(): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()
        return manufacturer.contains("realme") || 
               manufacturer.contains("oppo") || 
               brand.contains("realme") ||
               brand.contains("oppo")
    }

    /**
     * Abre as configurações de bateria da Realme para o app
     */
    fun openBatterySettings(context: Context) {
        try {
            val intent = Intent().apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                
                when {
                    // Realme/ColorOS
                    isRealmeDevice() -> {
                        action = "android.settings.APPLICATION_DETAILS_SETTINGS"
                        data = android.net.Uri.fromParts("package", context.packageName, null)
                    }
                    else -> {
                        action = android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                    }
                }
            }
            context.startActivity(intent)
            Log.d(TAG, "Abrindo configurações de bateria para Realme")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de bateria", e)
            // Fallback: tentar abrir configurações gerais do app
            try {
                val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e2: Exception) {
                Log.e(TAG, "Erro no fallback", e2)
            }
        }
    }

    /**
     * Abre as configurações de início automático da Realme
     */
    fun openAutoStartSettings(context: Context) {
        if (!isRealmeDevice()) {
            Log.d(TAG, "Não é dispositivo Realme, ignorando")
            return
        }

        try {
            // Tentar abrir configuração de auto-start da Realme/ColorOS
            val intents = listOf(
                Intent().apply {
                    component = ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                    )
                },
                Intent().apply {
                    component = ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.startupapp.StartupAppListActivity"
                    )
                },
                Intent().apply {
                    component = ComponentName(
                        "com.oppo.safe",
                        "com.oppo.safe.permission.startup.StartupAppListActivity"
                    )
                },
                // Fallback: configurações do app
                Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.fromParts("package", context.packageName, null)
                }
            )

            for (intent in intents) {
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    Log.d(TAG, "Abriu configurações de auto-start da Realme")
                    return
                } catch (e: Exception) {
                    // Tentar próximo
                    continue
                }
            }

            Log.w(TAG, "Não foi possível abrir configurações de auto-start")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de auto-start", e)
        }
    }

    /**
     * Mostra um diálogo explicando as configurações necessárias
     */
    fun showRealmeSetupInstructions(context: Context) {
        if (!isRealmeDevice()) return

        try {
            android.app.AlertDialog.Builder(context)
                .setTitle("Configuração Necessária - Realme")
                .setMessage(
                    "Para o MDM funcionar corretamente na Realme, você precisa:\n\n" +
                    "1. Uso da Bateria: Sem restrições\n" +
                    "2. Início Automático: ATIVADO\n" +
                    "3. Executar em Segundo Plano: ATIVADO\n\n" +
                    "Deseja abrir as configurações agora?"
                )
                .setPositiveButton("Sim") { _, _ ->
                    openBatterySettings(context)
                }
                .setNegativeButton("Depois", null)
                .show()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao mostrar instruções", e)
        }
    }
}

