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
     * Tenta abrir a tela específica de "Uso da Bateria" do app
     */
    fun openBatterySettings(context: Context) {
        try {
            Log.d(TAG, "Tentando abrir configurações de bateria para Realme")
            
            val packageName = context.packageName
            
            if (isRealmeDevice()) {
                // ✅ NOVO: Para Realme/ColorOS, tentar múltiplas abordagens específicas
                val intents = listOf(
                    // Opção 1: Configurações do app (depois o usuário navega para "Uso de bateria")
                    Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = android.net.Uri.fromParts("package", packageName, null)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    },
                    // Opção 2: Pedir ignorar otimização (abre tela específica)
                    Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = android.net.Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                    // Opção 3: Configurações gerais de bateria
                    Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                )
                
                for ((index, intent) in intents.withIndex()) {
                    try {
                        context.startActivity(intent)
                        Log.d(TAG, "✅ Configurações de bateria aberta com sucesso (opção ${index + 1})")
                        return
                    } catch (e: Exception) {
                        Log.w(TAG, "Opção ${index + 1} falhou: ${e.message}")
                        if (index == intents.lastIndex) {
                            // Última tentativa, usar fallback
                            throw e
                        }
                        continue
                    }
                }
            } else {
                // Dispositivos não-Realme
                val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.fromParts("package", packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                Log.d(TAG, "Abrindo configurações de bateria (dispositivo padrão)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir configurações de bateria", e)
            // Fallback: tentar abrir configurações gerais do app
            try {
                val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                Log.d(TAG, "Abrindo configurações gerais do app (fallback)")
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

