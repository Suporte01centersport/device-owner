package com.mdm.launcher.utils

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.gson.Gson
import com.mdm.launcher.MainActivity
import com.mdm.launcher.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.os.Process

/**
 * 🎯 MONITOR DE APPS EM TEMPO REAL
 * 
 * Detecta quando o usuário abre apps não permitidos e força retorno ao launcher MDM
 * 
 * ⚠️ CUIDADO: Pode causar boot loop se implementado incorretamente
 * ⚠️ TESTE: Aplique apenas via comando remoto, não no boot
 */
object AppMonitor {
    private const val TAG = "AppMonitor"
    private var isMonitoring = false
    private val handler = Handler(Looper.getMainLooper())
    private var context: Context? = null
    private val allowedApps = mutableListOf<String>()
    private const val MONITOR_INTERVAL = 5000L // ✅ CORREÇÃO: Aumentado para 5 segundos (era 2s)
    private const val FAST_MONITOR_INTERVAL = 2000L // Intervalo rápido quando app não permitido detectado
    private var currentInterval = MONITOR_INTERVAL
    
    // ✅ CORREÇÃO: Lock para evitar race conditions
    private val monitorLock = Any()
    private val appsLock = Any()
    
    // ✅ NOVO: Instância do AppUsageTracker para registrar acessos
    private var appUsageTracker: AppUsageTracker? = null
    
    // ✅ NOVO: Controle para evitar contagem duplicada
    private var lastTrackedApp = ""
    private var lastTrackedTime = 0L
    private const val TRACKING_COOLDOWN = 5000L // ✅ CORREÇÃO: Reduzido para 5 segundos
    
    // ✅ NOVO: Mapeamento de apps relacionados (para evitar contagem dupla)
    private val relatedApps = mapOf(
        "com.google.android.apps.youtube.music" to "com.google.android.youtube",
        "com.google.android.youtube" to "com.google.android.apps.youtube.music"
    )
    
    // ✅ NOVO: Controle de mudanças de tela dentro do mesmo app
    private var lastForegroundPackage = ""
    private var lastForegroundTime = 0L
    private const val SCREEN_CHANGE_COOLDOWN = 2000L // ✅ CORREÇÃO: Reduzido para 2 segundos
    
    // ✅ NOVO: Controle de estado do app para detectar entrada/saída
    private var appStates = mutableMapOf<String, Long>() // package -> timestamp da última entrada
    private const val APP_EXIT_TIMEOUT = 10000L // 10 segundos para considerar que saiu do app
    
    private val monitorRunnable = object : Runnable {
        override fun run() {
            if (!isMonitoring) return
            
            val ctx = context ?: return
            val activityManager = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            
            try {
                // ✅ CORREÇÃO: Usar API moderna para detectar app em foreground
                val foregroundPackage = getForegroundAppPackage(ctx)
                
                    if (foregroundPackage != null) {
                        val currentTime = System.currentTimeMillis()
                        
                        Log.d(TAG, "🔍 === DETECÇÃO DE APP EM FOREGROUND ===")
                        Log.d(TAG, "🔍 App detectado: $foregroundPackage")
                        Log.d(TAG, "🔍 Último app contado: $lastTrackedApp")
                        Log.d(TAG, "🔍 Última contagem: ${currentTime - lastTrackedTime}ms atrás")
                        Log.d(TAG, "🔍 Último foreground: $lastForegroundPackage")
                        Log.d(TAG, "🔍 Tempo desde último foreground: ${currentTime - lastForegroundTime}ms")
                        Log.d(TAG, "🔍 Modo de bloqueio: ${if (allowedApps.size <= 1) "TOTAL" else "NORMAL"}")
                        Log.d(TAG, "🔍 Apps permitidos: ${allowedApps.size}")
                        Log.d(TAG, "🔍 Lista de permitidos: $allowedApps")
                        
                        // ✅ NOVO: Verificar se é apenas mudança de tela dentro do mesmo app
                        val isSameAppAsLastForeground = foregroundPackage == lastForegroundPackage
                        val isRecentForegroundChange = (currentTime - lastForegroundTime) < SCREEN_CHANGE_COOLDOWN
                        
                        if (isSameAppAsLastForeground && isRecentForegroundChange) {
                            Log.d(TAG, "🔄 Mudança de tela dentro do mesmo app ($foregroundPackage) - ignorando")
                            lastForegroundPackage = foregroundPackage
                            lastForegroundTime = currentTime
                            handler.postDelayed(this, currentInterval)
                            return
                        }
                        
                        // Atualizar controle de foreground
                        lastForegroundPackage = foregroundPackage
                        lastForegroundTime = currentTime
                        
                        if (foregroundPackage != ctx.packageName) {
                            val isAllowed = isAppAllowed(foregroundPackage)
                            Log.d(TAG, "🔍 App $foregroundPackage permitido: $isAllowed")
                            
                            if (!isAllowed) {
                                Log.d(TAG, "🚫 App não permitido detectado: $foregroundPackage")
                                forceReturnToLauncher(ctx, foregroundPackage, activityManager)
                                // ✅ CORREÇÃO: Usar intervalo rápido após detectar app não permitido
                                currentInterval = FAST_MONITOR_INTERVAL
                            } else {
                                Log.d(TAG, "✅ App permitido: $foregroundPackage")
                                
                                // ✅ NOVO: Lógica inteligente para detectar entrada/saída de apps
                                val lastEntryTime = appStates[foregroundPackage] ?: 0L
                                val timeSinceLastEntry = currentTime - lastEntryTime
                                val isNewEntry = timeSinceLastEntry > APP_EXIT_TIMEOUT
                                
                                Log.d(TAG, "🔍 === VERIFICAÇÃO INTELIGENTE ===")
                                Log.d(TAG, "🔍 App: $foregroundPackage")
                                Log.d(TAG, "🔍 Última entrada: $lastEntryTime")
                                Log.d(TAG, "🔍 Tempo desde última entrada: ${timeSinceLastEntry}ms")
                                Log.d(TAG, "🔍 Timeout para saída: ${APP_EXIT_TIMEOUT}ms")
                                Log.d(TAG, "🔍 É nova entrada: $isNewEntry")
                                
                                if (isNewEntry) {
                                    // ✅ NOVO: Registrar acesso no AppUsageTracker
                                    try {
                                        val appName = getAppName(ctx, foregroundPackage)
                                        Log.d(TAG, "📱 === REGISTRANDO NOVA ENTRADA ===")
                                        Log.d(TAG, "📱 App: $appName ($foregroundPackage)")
                                        Log.d(TAG, "📱 Timestamp: $currentTime")
                                        Log.d(TAG, "📱 Tempo desde última entrada: ${timeSinceLastEntry}ms")
                                        
                                        // Chamar AppUsageTracker diretamente
                                        appUsageTracker?.recordAppAccess(foregroundPackage, appName)
                                        
                                        // Atualizar estado do app
                                        appStates[foregroundPackage] = currentTime
                                        lastTrackedApp = foregroundPackage
                                        lastTrackedTime = currentTime
                                        
                                        Log.d(TAG, "✅ Nova entrada registrada com sucesso")
                                        Log.d(TAG, "📱 === FIM REGISTRO NOVA ENTRADA ===")
                                    } catch (e: Exception) {
                                        Log.e(TAG, "❌ Erro ao registrar nova entrada: ${e.message}")
                                    }
                                } else {
                                    Log.d(TAG, "⏳ App $foregroundPackage ainda em uso (${timeSinceLastEntry}ms) - não contando novamente")
                                    // Atualizar timestamp mesmo sem contar
                                    appStates[foregroundPackage] = currentTime
                                }
                                
                                // ✅ CORREÇÃO: Voltar ao intervalo normal quando tudo OK
                                currentInterval = MONITOR_INTERVAL
                            }
                        } else {
                            Log.d(TAG, "🔍 MDM Launcher em foreground - ignorando")
                        }
                        Log.d(TAG, "🔍 === FIM DETECÇÃO APP ===")
                    } else {
                        Log.d(TAG, "🔍 Não foi possível detectar app em foreground")
                        // ✅ CORREÇÃO: Manter intervalo normal quando não consegue detectar
                        currentInterval = MONITOR_INTERVAL
                    }
            } catch (e: SecurityException) {
                Log.e(TAG, "❌ SecurityException no monitoramento de apps: ${e.message}")
                Log.e(TAG, "ℹ️ App pode não ter permissões para monitorar apps em foreground")
                // ✅ CORREÇÃO: Usar intervalo mais longo em caso de erro
                currentInterval = MONITOR_INTERVAL * 2
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro no monitoramento de apps: ${e.message}")
                // ✅ CORREÇÃO: Usar intervalo mais longo em caso de erro
                currentInterval = MONITOR_INTERVAL * 2
            }
            
            handler.postDelayed(this, currentInterval)
        }
    }

    private fun forceReturnToLauncher(ctx: Context, blockedPackageName: String, activityManager: ActivityManager) {
        try {
            // Forçar retorno ao launcher MDM (sem limpar a pilha de tarefas)
            val intent = Intent(ctx, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            ctx.startActivity(intent)
            Log.d(TAG, "🔄 FORÇANDO RETORNO AO LAUNCHER MDM")
            
            // ✅ CORREÇÃO: Tentar finalizar o app não permitido com fallbacks
            try {
                // MÉTODO 1: Usar ActivityManager para finalizar processo
                activityManager.killBackgroundProcesses(blockedPackageName)
                Log.d(TAG, "✅ App $blockedPackageName finalizado via killBackgroundProcesses")
                
                // MÉTODO 2: Tentar matar processo diretamente (mais agressivo)
                val pids = activityManager.runningAppProcesses
                for (process in pids) {
                    if (process.processName == blockedPackageName) {
                        Process.killProcess(process.pid)
                        Log.d(TAG, "✅ App $blockedPackageName finalizado via Process.killProcess")
                        break
                    }
                }
                
            } catch (e: SecurityException) {
                Log.e(TAG, "❌ SecurityException ao tentar forçar parada de $blockedPackageName: ${e.message}")
                Log.e(TAG, "ℹ️ App pode não ter permissões para ser finalizado.")
                
                // ✅ FALLBACK: Tentar usar Device Policy Manager se disponível
                try {
                    val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                    val componentName = ComponentName(ctx, com.mdm.launcher.DeviceAdminReceiver::class.java)
                    
                    if (dpm.isDeviceOwnerApp(ctx.packageName)) {
                        // Tentar ocultar o app usando Device Owner
                        dpm.setApplicationHidden(componentName, blockedPackageName, true)
                        Log.d(TAG, "✅ App $blockedPackageName ocultado via Device Owner")
                    } else {
                        Log.w(TAG, "⚠️ Não é Device Owner - não pode ocultar app")
                    }
                } catch (e2: SecurityException) {
                    Log.e(TAG, "❌ SecurityException ao ocultar app: ${e2.message}")
                } catch (e2: Exception) {
                    Log.e(TAG, "❌ Erro ao ocultar app: ${e2.message}")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao tentar finalizar app $blockedPackageName: ${e.message}")
                
                // ✅ FALLBACK FINAL: Apenas registrar o evento
                Log.w(TAG, "⚠️ Não foi possível finalizar $blockedPackageName - apenas retornando ao launcher")
            }
            
            Log.d(TAG, "✅ Retorno ao launcher MDM forçado com sucesso")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao forçar retorno ao launcher", e)
            
            // ✅ FALLBACK CRÍTICO: Tentar abrir launcher de forma mais simples
            try {
                val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                ctx.startActivity(homeIntent)
                Log.d(TAG, "✅ Fallback: Launcher padrão aberto")
            } catch (e2: Exception) {
                Log.e(TAG, "❌ Fallback crítico falhou: ${e2.message}")
            }
        }
    }

    fun startMonitoring(appContext: Context) {
        synchronized(monitorLock) {
            if (isMonitoring) {
                Log.d(TAG, "Monitoramento já está ativo.")
                return
            }
            context = appContext.applicationContext
            
            // ✅ NOVO: Inicializar AppUsageTracker
            appUsageTracker = AppUsageTracker(appContext)
            
            Log.d(TAG, "🚀 INICIANDO APPMONITOR - Context: ${appContext.packageName}")
            loadAllowedApps(appContext) // Carregar apps permitidos ao iniciar
            isMonitoring = true
            handler.post(monitorRunnable)
            Log.d(TAG, "🎯 INICIANDO MONITORAMENTO DE APPS")
            
            synchronized(appsLock) {
                Log.d(TAG, "Apps permitidos: ${allowedApps.size}")
                allowedApps.forEach { Log.d(TAG, "  ✅ $it") }
            }
            Log.d(TAG, "✅ Monitoramento iniciado com sucesso")
            
            // ✅ NOVO: Iniciar limpeza periódica de estados antigos
            startStateCleanup()
        }
    }
    
    fun stopMonitoring() {
        synchronized(monitorLock) {
            if (!isMonitoring) return
            
            // ✅ CORREÇÃO: Limpeza completa para evitar vazamentos
            try {
                // Remover callbacks pendentes
                handler.removeCallbacks(monitorRunnable)
                
                // ✅ NOVO: Parar AppUsageTracker
                appUsageTracker?.stopTracking()
                appUsageTracker = null
                
                // Limpar lista de apps permitidos
                synchronized(appsLock) {
                    allowedApps.clear()
                }
                
                // Limpar referências
                context = null
                isMonitoring = false
                
                Log.d(TAG, "🛑 MONITORAMENTO DE APPS PARADO")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao parar monitoramento", e)
                // Forçar limpeza mesmo com erro
                isMonitoring = false
                context = null
                appUsageTracker = null
            }
        }
    }
    
    fun updateAllowedApps(appContext: Context, newAllowedApps: List<String>) {
        synchronized(monitorLock) {
            context = appContext.applicationContext
            
            Log.d(TAG, "🔄 ===== ATUALIZANDO APPS PERMITIDOS =====")
            Log.d(TAG, "🔄 Apps recebidos: $newAllowedApps")
            Log.d(TAG, "🔄 Quantidade: ${newAllowedApps.size}")
            
            synchronized(appsLock) {
                // Limpar lista atual
                allowedApps.clear()
                
                // Se há apps configurados via WebSocket, usar eles
                if (newAllowedApps.isNotEmpty() && !(newAllowedApps.size == 1 && newAllowedApps[0] == "[]")) {
                    Log.d(TAG, "✅ Lista válida detectada - usando apps configurados")
                    allowedApps.addAll(newAllowedApps)
                    
                    // Garantir que o próprio launcher MDM esteja sempre na lista de permitidos
                    if (!allowedApps.contains(appContext.packageName)) {
                        allowedApps.add(appContext.packageName)
                        Log.d(TAG, "➕ Adicionado MDM Launcher à lista: ${appContext.packageName}")
                    }
                    
                    Log.d(TAG, "✅ Apps permitidos atualizados: ${allowedApps.size}")
                    Log.d(TAG, "📋 Lista final: $allowedApps")
                } else {
                    Log.d(TAG, "🚫 Lista vazia ou inválida - usando configuração padrão")
                    // Configuração padrão: MDM Launcher + Settings
                    allowedApps.add(appContext.packageName)
                    allowedApps.add("com.android.settings")
                    Log.d(TAG, "📋 Lista padrão: $allowedApps")
                }
            }
            
            Log.d(TAG, "🔄 ===== FIM ATUALIZAÇÃO APPS =====")
        }
    }

    private fun isAppAllowed(packageName: String): Boolean {
        // Sempre permitir o próprio launcher MDM
        if (packageName == context?.packageName) {
            return true
        }
        
        // Se está em modo de bloqueio total (apenas 1 app: MDM), 
        // verificar apenas a lista de permitidos
        if (allowedApps.size <= 1) {
            Log.d(TAG, "🚫 Modo bloqueio total: apenas ${allowedApps.size} app(s) permitido(s)")
            return allowedApps.contains(packageName)
        }
        
        // Para modo normal, permitir apps do sistema críticos (para evitar boot loops ou travamentos)
        if (isSystemCriticalApp(packageName)) {
            Log.d(TAG, "✅ App do sistema crítico permitido: $packageName")
            return true
        }
        
        val isAllowed = allowedApps.contains(packageName)
        Log.d(TAG, "🔍 App $packageName permitido: $isAllowed")
        return isAllowed
    }

    private fun isSystemCriticalApp(packageName: String): Boolean {
        // ✅ CORREÇÃO: Lista mais restritiva de apps críticos do sistema
        val criticalSystemProcesses = listOf(
            "android", // O próprio sistema Android
            "com.android.systemui", // Barra de status, navegação
            "com.android.settings", // Configurações
            "com.android.permissioncontroller" // Controlador de permissões
        )
        
        // ✅ CORREÇÃO: Apenas apps realmente críticos, não todos os com.android.*
        return criticalSystemProcesses.contains(packageName)
    }

    /**
     * ✅ CORREÇÃO: Detectar app em foreground usando APIs modernas
     * Compatível com Android 10+ e evita APIs deprecated
     */
    private fun getForegroundAppPackage(context: Context): String? {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            
            // MÉTODO 1: Usar getRunningAppProcesses() (mais confiável)
            val runningProcesses = activityManager.runningAppProcesses
            if (runningProcesses != null) {
                for (processInfo in runningProcesses) {
                    if (processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                        // Verificar se tem activities em foreground
                        if (processInfo.pkgList.isNotEmpty()) {
                            val packageName = processInfo.pkgList[0]
                            Log.d(TAG, "🔍 App em foreground detectado via runningAppProcesses: $packageName")
                            return packageName
                        }
                    }
                }
            }
            
            // MÉTODO 2: Fallback usando getRunningTasks() apenas se necessário
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
                try {
                    @Suppress("DEPRECATION")
                    val tasks = activityManager.getRunningTasks(1)
                    if (tasks.isNotEmpty()) {
                        val packageName = tasks[0].topActivity?.packageName
                        Log.d(TAG, "🔍 App em foreground detectado via getRunningTasks (fallback): $packageName")
                        return packageName
                    }
                } catch (e: SecurityException) {
                    Log.w(TAG, "⚠️ getRunningTasks() bloqueado por segurança")
                }
            }
            
            // MÉTODO 3: Usar UsageStatsManager se disponível (Android 5+)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                try {
                    val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
                    val currentTime = System.currentTimeMillis()
                    val usageStats = usageStatsManager.queryUsageStats(
                        android.app.usage.UsageStatsManager.INTERVAL_DAILY,
                        currentTime - 10000, // Últimos 10 segundos
                        currentTime
                    )
                    
                    if (usageStats != null && usageStats.isNotEmpty()) {
                        // Encontrar o app mais recente
                        val mostRecent = usageStats.maxByOrNull { it.lastTimeUsed }
                        if (mostRecent != null) {
                            Log.d(TAG, "🔍 App em foreground detectado via UsageStats: ${mostRecent.packageName}")
                            return mostRecent.packageName
                        }
                    }
                } catch (e: SecurityException) {
                    Log.w(TAG, "⚠️ UsageStatsManager requer permissão PACKAGE_USAGE_STATS")
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Erro ao usar UsageStatsManager: ${e.message}")
                }
            }
            
            Log.w(TAG, "⚠️ Não foi possível detectar app em foreground")
            null
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao detectar app em foreground: ${e.message}")
            null
        }
    }

    /**
     * Obtém o nome amigável do app pelo package name
     */
    private fun getAppName(context: Context, packageName: String): String {
        return try {
            val packageManager = context.packageManager
            val applicationInfo = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(applicationInfo).toString()
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Não foi possível obter nome do app: $packageName")
            packageName
        }
    }
    
    /**
     * Obtém instância da MainActivity para acessar AppUsageTracker
     */
    private fun getMainActivityInstance(context: Context): MainActivity? {
        return try {
            // Tentar obter a instância ativa da MainActivity
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val runningTasks = activityManager.getRunningTasks(1)
            
            if (runningTasks.isNotEmpty()) {
                val topActivity = runningTasks[0].topActivity
                if (topActivity?.className == MainActivity::class.java.name) {
                    // Se a MainActivity está no topo, tentar obter referência
                    // Nota: Esta é uma abordagem limitada, mas funciona para casos simples
                    return null // Por enquanto, retornar null e usar método alternativo
                }
            }
            null
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao obter instância da MainActivity: ${e.message}")
            null
        }
    }
    private fun loadAllowedApps(context: Context) {
        Log.d(TAG, "🔍 ===== CARREGANDO APPS PERMITIDOS =====")
        Log.d(TAG, "🔍 Context packageName: ${context.packageName}")
        try {
            val sharedPreferences = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val gson = Gson()
            val savedAllowedApps = sharedPreferences.getString("allowed_apps", null)
            
            Log.d(TAG, "🔍 Carregando apps permitidos do SharedPreferences...")
            Log.d(TAG, "📋 Valor raw do SharedPreferences: $savedAllowedApps")
            
            // Limpar lista atual
            allowedApps.clear()
            
            if (savedAllowedApps != null && savedAllowedApps.isNotEmpty()) {
                val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
                val apps = gson.fromJson<List<String>>(savedAllowedApps, type)
                
                Log.d(TAG, "📋 Apps carregados do JSON: $apps")
                Log.d(TAG, "📊 Quantidade de apps carregados: ${apps.size}")
                
                // Verificar se a lista não está vazia e não contém apenas "[]"
                if (apps.isNotEmpty() && !(apps.size == 1 && apps[0] == "[]")) {
                    Log.d(TAG, "✅ Lista válida detectada - usando apps salvos")
                    allowedApps.addAll(apps)
                    
                    // Garantir que o próprio launcher MDM esteja sempre na lista de permitidos
                    if (!allowedApps.contains(context.packageName)) {
                        allowedApps.add(context.packageName)
                        Log.d(TAG, "➕ Adicionado MDM Launcher à lista: ${context.packageName}")
                    }
                    
                    Log.d(TAG, "✅ Apps permitidos carregados: ${allowedApps.size}")
                    Log.d(TAG, "📋 Lista final: $allowedApps")
                } else {
                    Log.d(TAG, "🚫 Lista vazia ou inválida - usando configuração padrão")
                    // Configuração padrão: MDM Launcher + Settings
                    allowedApps.add(context.packageName)
                    allowedApps.add("com.android.settings")
                    Log.d(TAG, "📋 Lista padrão: $allowedApps")
                }
            } else {
                Log.d(TAG, "🚫 Nenhum app salvo - usando configuração padrão")
                // Configuração padrão: MDM Launcher + Settings
                allowedApps.add(context.packageName)
                allowedApps.add("com.android.settings")
                Log.d(TAG, "📋 Lista padrão: $allowedApps")
                Log.d(TAG, "⚠️ Configure apps permitidos via WebSocket para controle personalizado")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao carregar apps permitidos", e)
            // Lista de emergência - MDM + Settings
            allowedApps.clear()
            allowedApps.add(context.packageName)
            allowedApps.add("com.android.settings")
            Log.d(TAG, "🚫 Lista de emergência: MDM Launcher + Settings")
            Log.d(TAG, "📋 Lista de emergência: $allowedApps")
        }
    }
    
    // ✅ NOVO: Função para limpeza periódica de estados antigos
    private fun startStateCleanup() {
        handler.postDelayed(object : Runnable {
            override fun run() {
                if (!isMonitoring) return
                
                val currentTime = System.currentTimeMillis()
                val appsToRemove = mutableListOf<String>()
                
                // Encontrar apps que não foram usados há mais de 1 hora
                for ((packageName, lastTime) in appStates) {
                    if (currentTime - lastTime > 3600000L) { // 1 hora
                        appsToRemove.add(packageName)
                    }
                }
                
                // Remover apps antigos
                for (packageName in appsToRemove) {
                    appStates.remove(packageName)
                    Log.d(TAG, "🧹 Removido estado antigo do app: $packageName")
                }
                
                if (appsToRemove.isNotEmpty()) {
                    Log.d(TAG, "🧹 Limpeza de estados: ${appsToRemove.size} apps removidos")
                }
                
                // Agendar próxima limpeza em 5 minutos
                handler.postDelayed(this, 300000L) // 5 minutos
            }
        }, 300000L) // Primeira limpeza em 5 minutos
    }
}