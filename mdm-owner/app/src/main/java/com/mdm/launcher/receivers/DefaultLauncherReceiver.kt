package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log

class DefaultLauncherReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "DefaultLauncherReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        try {
            Log.d(TAG, "DefaultLauncherReceiver recebeu: ${intent.action}")
            
            // Aguardar estabilização para evitar conflitos
            Thread.sleep(1000)
            
            when (intent.action) {
                Intent.ACTION_PACKAGE_CHANGED,
                Intent.ACTION_PACKAGE_REPLACED,
                Intent.ACTION_PACKAGE_REMOVED -> {
                    Log.d(TAG, "Pacote alterado: ${intent.data}")
                    checkAndRestoreDefaultLauncher(context)
                }
                // Não iniciar o Launcher automaticamente logo após instalação
                // para não disparar solicitações de permissão antes da primeira abertura
                Intent.ACTION_PACKAGE_ADDED -> {
                    val addedPackage = intent.data?.schemeSpecificPart
                    Log.d(TAG, "Pacote instalado: $addedPackage")
                    if (addedPackage != context.packageName) {
                        checkAndRestoreDefaultLauncher(context)
                    } else {
                        Log.d(TAG, "Instalação do próprio app - não iniciar Activity automaticamente")
                    }
                }
                Intent.ACTION_BOOT_COMPLETED -> {
                    Log.d(TAG, "Sistema inicializado - verificando launcher padrão")
                    // Aguardar mais tempo após boot para evitar conflitos
                    Thread.sleep(5000)
                    checkAndRestoreDefaultLauncher(context)
                }
                Intent.ACTION_MY_PACKAGE_REPLACED -> {
                    Log.d(TAG, "MDM Launcher foi atualizado")
                    checkAndRestoreDefaultLauncher(context)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro no DefaultLauncherReceiver - pode causar boot loop!", e)
            // Não relançar exceção para evitar crash
        }
    }
    
    private fun checkAndRestoreDefaultLauncher(context: Context) {
        try {
            val packageManager = context.packageManager
            val currentLauncher = getCurrentDefaultLauncher(packageManager)
            
            Log.d(TAG, "Launcher padrão atual: $currentLauncher")
            
            if (currentLauncher != context.packageName) {
                Log.w(TAG, "Launcher padrão não é o MDM Launcher! Tentando restaurar...")
                restoreDefaultLauncher(context)
            } else {
                Log.d(TAG, "MDM Launcher é o launcher padrão ✓")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar launcher padrão", e)
        }
    }
    
    private fun getCurrentDefaultLauncher(packageManager: PackageManager): String? {
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
        }
        
        val resolveInfos = packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        if (resolveInfos.isNotEmpty()) {
            return resolveInfos[0].activityInfo.packageName
        }
        return null
    }
    
    private fun restoreDefaultLauncher(context: Context) {
        try {
            // Tentar definir o MDM Launcher como padrão novamente
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                setPackage(context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            
            Log.d(TAG, "Tentando restaurar MDM Launcher como padrão...")
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao restaurar launcher padrão", e)
        }
    }
}
