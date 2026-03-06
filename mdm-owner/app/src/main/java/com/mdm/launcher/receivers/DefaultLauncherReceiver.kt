package com.mdm.launcher.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.*

/**
 * VERSÃO NÃO-INVASIVA: Receiver desabilitado por padrão para evitar boot loops
 * 
 * Este receiver foi desabilitado no AndroidManifest porque:
 * 1. O app já é configurado como HOME category no launcher
 * 2. Thread.sleep() bloqueia o processo de boot
 * 3. Iniciar Activities durante boot pode causar loops
 * 
 * Se precisar reabilitar, use:
 * adb shell pm enable com.mdm.launcher/.receivers.DefaultLauncherReceiver
 */
class DefaultLauncherReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "DefaultLauncherReceiver"
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        try {
            Log.d(TAG, "📱 DefaultLauncherReceiver recebeu: ${intent.action}")
            
            // IMPORTANTE: Usar goAsync() para não bloquear o boot
            val pendingResult = goAsync()
            
            scope.launch {
                try {
                    when (intent.action) {
                        Intent.ACTION_PACKAGE_CHANGED,
                        Intent.ACTION_PACKAGE_REPLACED,
                        Intent.ACTION_PACKAGE_REMOVED -> {
                            Log.d(TAG, "Pacote alterado: ${intent.data}")
                            delay(2000) // Aguardar assincronamente sem bloquear
                            checkAndLogLauncherStatus(context)
                        }
                        Intent.ACTION_PACKAGE_ADDED -> {
                            val addedPackage = intent.data?.schemeSpecificPart
                            Log.d(TAG, "Pacote instalado: $addedPackage")
                            if (addedPackage != context.packageName) {
                                delay(2000)
                                checkAndLogLauncherStatus(context)
                            }
                        }
                        Intent.ACTION_MY_PACKAGE_REPLACED -> {
                            Log.d(TAG, "MDM Center foi atualizado")
                            delay(2000)
                            checkAndLogLauncherStatus(context)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Erro no processamento", e)
                } finally {
                    pendingResult.finish()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro no DefaultLauncherReceiver", e)
        }
    }
    
    /**
     * VERSÃO NÃO-INVASIVA: Apenas loga o status sem tentar forçar
     */
    private fun checkAndLogLauncherStatus(context: Context) {
        try {
            val packageManager = context.packageManager
            val currentLauncher = getCurrentDefaultLauncher(packageManager)
            
            if (currentLauncher == context.packageName) {
                Log.d(TAG, "✅ MDM Center é o launcher padrão")
            } else {
                Log.w(TAG, "⚠️ Launcher padrão: $currentLauncher (não é o MDM)")
                Log.w(TAG, "ℹ️ O usuário precisará configurar manualmente o launcher padrão")
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
}
