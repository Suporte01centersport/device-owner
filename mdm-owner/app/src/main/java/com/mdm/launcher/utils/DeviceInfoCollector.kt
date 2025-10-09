package com.mdm.launcher.utils

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.StatFs
import android.provider.Settings
import android.util.Log
import com.mdm.launcher.data.AppInfo
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.utils.IconUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.*

object DeviceInfoCollector {
    
    suspend fun collectDeviceInfo(context: Context, customName: String? = null): DeviceInfo = withContext(Dispatchers.IO) {
        val packageManager = context.packageManager
        val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        
        // Coletar informações básicas do dispositivo
        val deviceId = getDeviceId(context)
        val batteryInfo = getBatteryInfo(context)
        val storageInfo = getStorageInfo()
        val memoryInfo = getMemoryInfo(context)
        val networkInfo = getNetworkInfo(context)
        val installedApps = getInstalledApps(packageManager)
        val locationInfo = getLocationInfo(context)
        
        DeviceInfo(
            deviceId = deviceId,
            name = customName ?: Build.MODEL,
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            androidVersion = Build.VERSION.RELEASE,
            apiLevel = Build.VERSION.SDK_INT,
            serialNumber = getSerialNumber(context),
            imei = getImei(context),
            macAddress = getMacAddress(context),
            ipAddress = getIpAddress(context),
            batteryLevel = batteryInfo.first,
            batteryStatus = batteryInfo.second,
            isCharging = batteryInfo.third,
            storageTotal = storageInfo.first,
            storageUsed = storageInfo.second,
            memoryTotal = memoryInfo.first,
            memoryUsed = memoryInfo.second,
            cpuArchitecture = Build.CPU_ABI,
            screenResolution = getScreenResolution(context),
            screenDensity = context.resources.displayMetrics.densityDpi,
            networkType = networkInfo.first,
            wifiSSID = networkInfo.second,
            isWifiEnabled = networkInfo.third,
            isBluetoothEnabled = isBluetoothEnabled(context),
            isLocationEnabled = isLocationEnabled(context),
            isDeveloperOptionsEnabled = isDeveloperOptionsEnabled(context),
            isAdbEnabled = isAdbEnabled(context),
            isUnknownSourcesEnabled = isUnknownSourcesEnabled(context),
            installedAppsCount = installedApps.size,
            isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(context.packageName),
            isProfileOwner = devicePolicyManager.isProfileOwnerApp(context.packageName),
            appVersion = getAppVersion(context),
            timezone = TimeZone.getDefault().id,
            language = Locale.getDefault().language,
            country = Locale.getDefault().country,
            installedApps = installedApps,
            allowedApps = getAllowedApps(context),
            lastKnownLocation = locationInfo.first,
            latitude = locationInfo.second,
            longitude = locationInfo.third,
            locationAccuracy = locationInfo.fourth,
            locationProvider = locationInfo.fifth,
            lastLocationUpdate = locationInfo.sixth,
            address = locationInfo.seventh,
            locationHistoryCount = locationInfo.eighth
        )
    }
    
    private fun getDeviceId(context: Context): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        Log.d("DeviceInfoCollector", "Android ID obtido: ${androidId?.takeLast(4) ?: "null"}")
        return androidId ?: "unknown"
    }
    
    private fun getBatteryInfo(context: Context): Triple<Int, String, Boolean> {
        return try {
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            
            // Para emuladores, usar valores simulados se necessário
            val batteryLevel = try {
                val level = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                if (level == Int.MIN_VALUE || level < 0) {
                    Log.w("DeviceInfoCollector", "Bateria retornou valor inválido ($level), usando valor simulado")
                    85 // Valor simulado para emulador
                } else {
                    level
                }
            } catch (e: Exception) {
                Log.w("DeviceInfoCollector", "Erro ao obter nível da bateria, usando valor simulado", e)
                85 // Valor simulado para emulador
            }
            
            val batteryStatus = try {
                val status = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
                when (status) {
                    BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
                    BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
                    BatteryManager.BATTERY_STATUS_FULL -> "full"
                    BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
                    else -> "unknown"
                }
            } catch (e: Exception) {
                Log.w("DeviceInfoCollector", "Erro ao obter status da bateria, usando 'unknown'", e)
                "unknown"
            }
            
            val isCharging = batteryStatus == "charging"
            
            Log.d("DeviceInfoCollector", "Bateria coletada: $batteryLevel%, status: $batteryStatus, carregando: $isCharging")
            Triple(batteryLevel, batteryStatus, isCharging)
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro ao coletar informações da bateria", e)
            Triple(85, "unknown", false) // Valores simulados para emulador
        }
    }
    
    private fun getStorageInfo(): Pair<Long, Long> {
        return try {
            val stat = StatFs(File("/data").absolutePath)
            val blockSize = stat.blockSizeLong
            val totalBlocks = stat.blockCountLong
            val availableBlocks = stat.availableBlocksLong
            
            val total = totalBlocks * blockSize
            val used = (totalBlocks - availableBlocks) * blockSize
            
            // Verificar se os valores são válidos
            if (total <= 0 || used < 0) {
                Log.w("DeviceInfoCollector", "Valores de armazenamento inválidos (Total: $total, Usado: $used), usando valores simulados")
                val simulatedTotal = 32L * 1024 * 1024 * 1024 // 32GB
                val simulatedUsed = 15L * 1024 * 1024 * 1024  // 15GB usado
                Log.d("DeviceInfoCollector", "Armazenamento simulado: Total=${simulatedTotal / (1024*1024*1024)}GB, Usado=${simulatedUsed / (1024*1024*1024)}GB")
                return Pair(simulatedTotal, simulatedUsed)
            }
            
            Log.d("DeviceInfoCollector", "Armazenamento coletado: Total=${total / (1024*1024*1024)}GB, Usado=${used / (1024*1024*1024)}GB")
            Pair(total, used)
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro ao coletar informações de armazenamento", e)
            val simulatedTotal = 32L * 1024 * 1024 * 1024 // 32GB
            val simulatedUsed = 15L * 1024 * 1024 * 1024  // 15GB usado
            Log.d("DeviceInfoCollector", "Usando valores simulados após erro: Total=${simulatedTotal / (1024*1024*1024)}GB, Usado=${simulatedUsed / (1024*1024*1024)}GB")
            Pair(simulatedTotal, simulatedUsed)
        }
    }
    
    private fun getMemoryInfo(context: Context): Pair<Long, Long> {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memoryInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memoryInfo)
        
        val total = memoryInfo.totalMem
        val used = total - memoryInfo.availMem
        
        return Pair(total, used)
    }
    
    private fun getNetworkInfo(context: Context): Triple<String, String?, Boolean> {
        val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        
        val networkType = when {
            connectivityManager.activeNetworkInfo?.type == android.net.ConnectivityManager.TYPE_WIFI -> "wifi"
            connectivityManager.activeNetworkInfo?.type == android.net.ConnectivityManager.TYPE_MOBILE -> "mobile"
            else -> "unknown"
        }
        
        val wifiSSID = if (wifiManager.isWifiEnabled) {
            val wifiInfo = wifiManager.connectionInfo
            wifiInfo?.ssid?.removeSurrounding("\"")
        } else null
        
        val isWifiEnabled = wifiManager.isWifiEnabled
        
        return Triple(networkType, wifiSSID, isWifiEnabled)
    }
    
    private fun getInstalledApps(packageManager: PackageManager): List<AppInfo> {
        val packages = packageManager.getInstalledPackages(0)
        val apps = mutableListOf<AppInfo>()
        
        Log.d("DeviceInfoCollector", "Carregando ${packages.size} pacotes instalados...")
        
        // Filtrar apenas apps relevantes primeiro (otimização)
        val relevantPackages = packages.filter { packageInfo ->
            val appInfo = packageInfo.applicationInfo
            val isEnabled = appInfo.enabled
            val hasLaunchIntent = packageManager.getLaunchIntentForPackage(packageInfo.packageName) != null
            val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val isUpdatedSystemApp = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            
            // Critérios otimizados para inclusão
            hasLaunchIntent && isEnabled && (!isSystemApp || isUpdatedSystemApp || isCommonLauncherSystemApp(packageInfo.packageName))
        }
        
        Log.d("DeviceInfoCollector", "Apps relevantes encontrados: ${relevantPackages.size}")
        
        // Processar apenas apps relevantes
        for (packageInfo in relevantPackages) {
            val appInfo = packageInfo.applicationInfo
            val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val isUpdatedSystemApp = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            val isEnabled = appInfo.enabled
            
            try {
                // Carregar ícone de forma segura (evitando APIs ocultas)
                val icon = try {
                    appInfo.loadIcon(packageManager)
                } catch (e: Exception) {
                    Log.w("DeviceInfoCollector", "Erro ao carregar ícone de ${packageInfo.packageName}: ${e.message}")
                    null
                }
                
                val iconBase64 = icon?.let { IconUtils.convertDrawableToBase64(it) } ?: ""
                
                val app = AppInfo(
                    packageName = packageInfo.packageName,
                    appName = appInfo.loadLabel(packageManager).toString(),
                    icon = icon,
                    iconBase64 = iconBase64,
                    isSystemApp = isSystemApp && !isUpdatedSystemApp,
                    isEnabled = isEnabled,
                    versionName = packageInfo.versionName,
                    versionCode = packageInfo.longVersionCode,
                    installTime = packageInfo.firstInstallTime,
                    updateTime = packageInfo.lastUpdateTime,
                    isAllowed = false // Será definido pelo servidor
                )
                
                apps.add(app)
            } catch (e: Exception) {
                Log.w("DeviceInfoCollector", "Erro ao processar app ${packageInfo.packageName}: ${e.message}")
            }
        }
        
        Log.d("DeviceInfoCollector", "Apps carregados com sucesso: ${apps.size}")
        
        // Se não encontrou apps, adicionar alguns básicos para emulador
        if (apps.isEmpty()) {
            Log.w("DeviceInfoCollector", "Nenhum app encontrado, adicionando apps básicos para emulador")
            apps.addAll(listOf(
                AppInfo(
                    packageName = "com.android.settings",
                    appName = "Settings",
                    icon = null,
                    isSystemApp = true,
                    isEnabled = true,
                    versionName = "1.0",
                    versionCode = 1L,
                    installTime = System.currentTimeMillis(),
                    updateTime = System.currentTimeMillis(),
                    isAllowed = false
                ),
                AppInfo(
                    packageName = "com.android.chrome",
                    appName = "Chrome",
                    icon = null,
                    isSystemApp = false,
                    isEnabled = true,
                    versionName = "1.0",
                    versionCode = 1L,
                    installTime = System.currentTimeMillis(),
                    updateTime = System.currentTimeMillis(),
                    isAllowed = false
                ),
                AppInfo(
                    packageName = "com.mdm.launcher",
                    appName = "MDM Launcher",
                    icon = null,
                    isSystemApp = false,
                    isEnabled = true,
                    versionName = "1.0",
                    versionCode = 1L,
                    installTime = System.currentTimeMillis(),
                    updateTime = System.currentTimeMillis(),
                    isAllowed = true
                )
            ))
            Log.d("DeviceInfoCollector", "Apps básicos adicionados, total: ${apps.size}")
        }
        
        return apps.sortedBy { it.appName }
    }
    
    private fun shouldAppearInLauncher(packageInfo: android.content.pm.PackageInfo, appInfo: android.content.pm.ApplicationInfo, packageManager: PackageManager): Boolean {
        val packageName = packageInfo.packageName
        val isEnabled = appInfo.enabled
        val hasLaunchIntent = packageManager.getLaunchIntentForPackage(packageName) != null
        
        // Incluir TODOS os apps que têm intent de lançamento e estão habilitados
        return hasLaunchIntent && isEnabled
    }
    
    private fun isCommonLauncherSystemApp(packageName: String): Boolean {
        // Apps do sistema que normalmente aparecem no launcher padrão
        val commonLauncherApps = listOf(
            // Apps do Google
            "com.google.android.apps.maps",
            "com.google.android.gm", 
            "com.google.android.youtube",
            "com.google.android.apps.photos",
            "com.google.android.apps.docs",
            "com.google.android.apps.drive",
            "com.google.android.apps.tachyon",
            "com.google.android.apps.messaging",
            "com.google.android.calendar",
            "com.google.android.apps.translate",
            "com.google.android.apps.books",
            "com.google.android.apps.magazines",
            "com.google.android.apps.music",
            "com.google.android.apps.newsstand",
            "com.google.android.apps.walletnfcrel",
            "com.google.android.apps.youtube.music",
            "com.google.android.apps.youtube.tv",
            "com.google.android.googlequicksearchbox",
            "com.google.android.inputmethod.latin",
            "com.google.android.keep",
            "com.google.android.apps.slides",
            "com.google.android.apps.sheets",
            "com.google.android.apps.tachyon",
            "com.google.android.apps.messaging",
            "com.google.android.apps.plus",
            "com.google.android.apps.translate",
            "com.google.android.apps.books",
            "com.google.android.apps.magazines",
            "com.google.android.apps.music",
            "com.google.android.apps.newsstand",
            "com.google.android.apps.plus",
            "com.google.android.apps.tachyon",
            "com.google.android.apps.walletnfcrel",
            "com.google.android.apps.youtube.music",
            "com.google.android.apps.youtube.tv",
            "com.google.android.gms",
            "com.google.android.googlequicksearchbox",
            "com.google.android.inputmethod.latin",
            "com.google.android.keep",
            "com.google.android.apps.docs",
            "com.google.android.apps.slides",
            "com.google.android.apps.sheets",
            
            // Apps do sistema Android
            "com.android.calculator2",
            "com.android.calendar",
            "com.android.camera2",
            "com.android.contacts",
            "com.android.dialer",
            "com.android.gallery3d",
            "com.android.mms",
            "com.android.music",
            "com.android.settings",
            "com.android.vending",
            "com.android.chrome",
            "com.android.clock",
            "com.android.filemanager",
            "com.android.packageinstaller",
            "com.android.providers.downloads",
            "com.android.providers.media",
            "com.android.providers.telephony",
            "com.android.providers.calendar",
            "com.android.providers.contacts",
            "com.android.providers.downloads",
            "com.android.providers.media",
            "com.android.providers.telephony",
            "com.android.providers.calendar",
            "com.android.providers.contacts",
            
            // Apps de operadoras comuns
            "com.tmobile.pr.adapt",
            "com.att.myWireless",
            "com.verizon.llkagent",
            "com.sprint.ce.updater",
            "com.orange.operator",
            "com.vodafone.vodafoneup",
            "com.telefonica.movistar",
            "com.claro.claromusica",
            "com.tim.tim",
            "com.wind.wind",
            "com.tre.tre",
            "com.posteitaliane.posteapp",
            "com.enel.enel",
            "com.tim.tim",
            "com.wind.wind",
            "com.tre.tre",
            "com.posteitaliane.posteapp",
            "com.enel.enel"
        )
        
        return commonLauncherApps.any { packageName.startsWith(it) }
    }
    
    private fun hasLauncherCategory(packageInfo: android.content.pm.PackageInfo, packageManager: PackageManager): Boolean {
        return try {
            val intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
            intent.addCategory(android.content.Intent.CATEGORY_LAUNCHER)
            intent.setPackage(packageInfo.packageName)
            
            val resolveInfos = packageManager.queryIntentActivities(intent, 0)
            resolveInfos.isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }
    
    private fun getExclusionReason(packageInfo: android.content.pm.PackageInfo, appInfo: android.content.pm.ApplicationInfo, packageManager: PackageManager): String {
        val isSystemApp = (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
        val isUpdatedSystemApp = (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
        val isEnabled = appInfo.enabled
        val hasLaunchIntent = packageManager.getLaunchIntentForPackage(packageInfo.packageName) != null
        
        return when {
            !hasLaunchIntent -> "Sem intent de lançamento"
            !isEnabled -> "Desabilitado"
            isSystemApp && !isUpdatedSystemApp && !isCommonLauncherSystemApp(packageInfo.packageName) -> "App do sistema interno"
            else -> "Não atende critérios do launcher"
        }
    }
    
    // Função para analisar aplicativos do launcher padrão
    suspend fun analyzeDefaultLauncherApps(context: Context): Unit = withContext(Dispatchers.IO) {
        val packageManager = context.packageManager
        val packages = packageManager.getInstalledPackages(0)
        
        Log.d("DeviceInfoCollector", "=== ANÁLISE DO LAUNCHER PADRÃO ===")
        
        // Aplicativos que normalmente aparecem no launcher padrão
        val defaultLauncherApps = mutableListOf<String>()
        
        for (packageInfo in packages) {
            val appInfo = packageInfo.applicationInfo
            val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val isUpdatedSystemApp = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            val isEnabled = appInfo.enabled
            val hasLaunchIntent = packageManager.getLaunchIntentForPackage(packageInfo.packageName) != null
            
            // Critérios para aparecer no launcher padrão
            val shouldAppearInLauncher = hasLaunchIntent && isEnabled && 
                                       (!isSystemApp || isUpdatedSystemApp || isCommonSystemApp(packageInfo.packageName))
            
            if (shouldAppearInLauncher) {
                val appName = appInfo.loadLabel(packageManager).toString()
                defaultLauncherApps.add("$appName (${packageInfo.packageName})")
                Log.d("DeviceInfoCollector", "📱 LAUNCHER PADRÃO: $appName (${packageInfo.packageName})")
            }
        }
        
        Log.d("DeviceInfoCollector", "Total de apps no launcher padrão: ${defaultLauncherApps.size}")
        Log.d("DeviceInfoCollector", "=== FIM ANÁLISE LAUNCHER PADRÃO ===")
    }
    
    private fun isCommonSystemApp(packageName: String): Boolean {
        // Apps do sistema que normalmente aparecem no launcher
        val commonSystemApps = listOf(
            "com.android.calculator2", // Calculadora
            "com.android.calendar", // Calendário
            "com.android.camera2", // Câmera
            "com.android.contacts", // Contatos
            "com.android.dialer", // Telefone
            "com.android.gallery3d", // Galeria
            "com.android.mms", // Mensagens
            "com.android.music", // Música
            "com.android.settings", // Configurações
            "com.android.vending", // Play Store
            "com.google.android.apps.maps", // Maps
            "com.google.android.gm", // Gmail
            "com.google.android.youtube", // YouTube
            "com.google.android.apps.photos", // Fotos
            "com.google.android.apps.docs", // Drive
            "com.google.android.apps.tachyon", // Duo
            "com.google.android.apps.messaging", // Mensagens
            "com.google.android.calendar", // Calendário
            "com.google.android.apps.plus", // Google+
            "com.google.android.apps.translate", // Tradutor
            "com.google.android.apps.books", // Play Livros
            "com.google.android.apps.magazines", // Play Revistas
            "com.google.android.apps.music", // Play Música
            "com.google.android.apps.newsstand", // Play Notícias
            "com.google.android.apps.plus", // Google+
            "com.google.android.apps.tachyon", // Duo
            "com.google.android.apps.walletnfcrel", // Google Pay
            "com.google.android.apps.youtube.music", // YouTube Music
            "com.google.android.apps.youtube.tv", // YouTube TV
            "com.google.android.gms", // Google Play Services
            "com.google.android.googlequicksearchbox", // Google App
            "com.google.android.inputmethod.latin", // Gboard
            "com.google.android.keep", // Keep
            "com.google.android.apps.docs", // Drive
            "com.google.android.apps.slides", // Apresentações
            "com.google.android.apps.sheets", // Planilhas
            "com.google.android.apps.tachyon", // Duo
            "com.google.android.apps.messaging", // Mensagens
            "com.google.android.apps.plus", // Google+
            "com.google.android.apps.translate", // Tradutor
            "com.google.android.apps.books", // Play Livros
            "com.google.android.apps.magazines", // Play Revistas
            "com.google.android.apps.music", // Play Música
            "com.google.android.apps.newsstand", // Play Notícias
            "com.google.android.apps.plus", // Google+
            "com.google.android.apps.tachyon", // Duo
            "com.google.android.apps.walletnfcrel", // Google Pay
            "com.google.android.apps.youtube.music", // YouTube Music
            "com.google.android.apps.youtube.tv", // YouTube TV
            "com.google.android.gms", // Google Play Services
            "com.google.android.googlequicksearchbox", // Google App
            "com.google.android.inputmethod.latin", // Gboard
            "com.google.android.keep", // Keep
            "com.google.android.apps.docs", // Drive
            "com.google.android.apps.slides", // Apresentações
            "com.google.android.apps.sheets" // Planilhas
        )
        
        return commonSystemApps.any { packageName.startsWith(it) }
    }
    
    private fun getSerialNumber(context: Context): String? {
        return try {
            Log.d("DeviceInfoCollector", "=== COLETANDO SERIAL NUMBER (Device Owner) ===")
            
            val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(context.packageName)
            Log.d("DeviceInfoCollector", "É Device Owner: $isDeviceOwner")
            Log.d("DeviceInfoCollector", "Package Name: ${context.packageName}")
            Log.d("DeviceInfoCollector", "Android Version: ${Build.VERSION.SDK_INT}")
            
            // Para Android 12+ (API 31+), usar Android ID diretamente (mais confiável)
            val serial = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && isDeviceOwner) {
                try {
                    // Enrollment ID pode estar vazio - usar Android ID como identificador único e estável
                    val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                    
                    if (androidId.isNullOrEmpty()) {
                        Log.w("DeviceInfoCollector", "Android ID vazio, tentando Enrollment ID...")
                        val enrollmentId = devicePolicyManager.getEnrollmentSpecificId()
                        if (enrollmentId.isNullOrEmpty()) {
                            Log.w("DeviceInfoCollector", "Enrollment ID também vazio, usando Build.SERIAL")
                            Build.SERIAL
                        } else {
                            Log.d("DeviceInfoCollector", "✓ Enrollment Specific ID obtido: ${enrollmentId.takeLast(4)}")
                            enrollmentId
                        }
                    } else {
                        Log.d("DeviceInfoCollector", "✓ Android ID obtido como serial (API 31+): ${androidId.takeLast(4)}")
                        androidId
                    }
                } catch (e: Exception) {
                    Log.w("DeviceInfoCollector", "Erro ao obter identificador: ${e.message}")
                    // Fallback: usar Android ID
                    val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                    Log.d("DeviceInfoCollector", "Usando Android ID como fallback: ${androidId?.takeLast(4)}")
                    androidId ?: "unknown"
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val buildSerial = Build.getSerial()
                    if (buildSerial != "unknown" && buildSerial.isNotEmpty()) {
                        Log.d("DeviceInfoCollector", "✓ Serial obtido via Build.getSerial(): ${buildSerial.takeLast(4)}")
                        buildSerial
                    } else {
                        // Fallback: usar Android ID
                        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                        Log.d("DeviceInfoCollector", "Serial inválido, usando Android ID: ${androidId.takeLast(4)}")
                        androidId
                    }
                } catch (e: SecurityException) {
                    Log.w("DeviceInfoCollector", "SecurityException ao obter Serial: ${e.message}")
                    // Fallback: usar Android ID como identificador único estável
                    val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                    Log.d("DeviceInfoCollector", "✓ Usando Android ID como identificador: ${androidId.takeLast(4)}")
                    androidId
                }
            } else {
                // Android < 8.0 - usar Build.SERIAL diretamente
                Build.SERIAL
            }
            
            Log.d("DeviceInfoCollector", "Serial final: ${serial?.let { "***${it.takeLast(4)}" } ?: "null"}")
            Log.d("DeviceInfoCollector", "===============================================")
            serial
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro geral ao obter Serial", e)
            // Último fallback: Android ID
            val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            Log.d("DeviceInfoCollector", "Usando Android ID após erro: ${androidId?.takeLast(4)}")
            androidId
        }
    }
    
    private fun getImei(context: Context): String? {
        return try {
            Log.d("DeviceInfoCollector", "=== COLETANDO IMEI (Device Owner) ===")
            
            val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(context.packageName)
            Log.d("DeviceInfoCollector", "É Device Owner: $isDeviceOwner")
            Log.d("DeviceInfoCollector", "Package Name: ${context.packageName}")
            Log.d("DeviceInfoCollector", "Android Version: ${Build.VERSION.SDK_INT}")
            
            // IMPORTANTE: No Android 10+, mesmo Device Owners precisam de READ_PRIVILEGED_PHONE_STATE
            // para acessar IMEI, que é uma permissão privilegiada apenas para apps de sistema.
            // Como alternativa, usaremos Android ID ou Enrollment ID que são únicos e acessíveis.
            
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            
            val imei = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ - IMEI requer permissões privilegiadas que Device Owner não tem
                // Usar identificador alternativo
                try {
                    Log.d("DeviceInfoCollector", "Android 10+: IMEI requer permissões privilegiadas")
                    Log.d("DeviceInfoCollector", "Usando Android ID como identificador alternativo")
                    null // Retornar null e usar deviceId (Android ID) como identificador principal
                } catch (e: Exception) {
                    Log.w("DeviceInfoCollector", "Erro: ${e.message}")
                    null
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    Log.d("DeviceInfoCollector", "Tentando telephonyManager.imei...")
                    val imeiValue = telephonyManager.imei
                    
                    if (imeiValue != null && imeiValue.isNotEmpty() && imeiValue != "unknown") {
                        Log.d("DeviceInfoCollector", "✓ IMEI válido obtido: ${imeiValue.takeLast(4)}")
                        imeiValue
                    } else {
                        null
                    }
                } catch (e: SecurityException) {
                    Log.d("DeviceInfoCollector", "SecurityException esperada no Android 10+: IMEI indisponível para Device Owner")
                    null
                }
            } else {
                @Suppress("DEPRECATION")
                try {
                    val deviceId = telephonyManager.deviceId
                    if (deviceId != null && deviceId.isNotEmpty() && deviceId != "unknown") {
                        Log.d("DeviceInfoCollector", "✓ DeviceId válido: ${deviceId.takeLast(4)}")
                        deviceId
                    } else {
                        null
                    }
                } catch (e: SecurityException) {
                    Log.d("DeviceInfoCollector", "SecurityException ao obter DeviceId")
                    null
                }
            }
            
            Log.d("DeviceInfoCollector", "IMEI final: ${imei?.let { "***${it.takeLast(4)}" } ?: "N/A (usando Android ID)"}")
            Log.d("DeviceInfoCollector", "===============================================")
            imei
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro geral ao obter IMEI", e)
            null
        }
    }
    
    private fun getMacAddress(context: Context): String? {
        return try {
            val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            val wifiInfo = wifiManager.connectionInfo
            wifiInfo?.macAddress
        } catch (e: Exception) {
            null
        }
    }
    
    private fun getIpAddress(context: Context): String? {
        return try {
            val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            val wifiInfo = wifiManager.connectionInfo
            val ipInt = wifiInfo?.ipAddress
            if (ipInt != null) {
                String.format(
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
            } else null
        } catch (e: Exception) {
            null
        }
    }
    
    private fun getScreenResolution(context: Context): String {
        val displayMetrics = context.resources.displayMetrics
        return "${displayMetrics.widthPixels}x${displayMetrics.heightPixels}"
    }
    
    private fun isBluetoothEnabled(context: Context): Boolean {
        return try {
            val bluetoothAdapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            bluetoothAdapter?.isEnabled ?: false
        } catch (e: Exception) {
            false
        }
    }
    
    private fun isLocationEnabled(context: Context): Boolean {
        return try {
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
            locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
        } catch (e: Exception) {
            false
        }
    }
    
    private fun isDeveloperOptionsEnabled(context: Context): Boolean {
        return Settings.Global.getInt(
            context.contentResolver,
            Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
            0
        ) != 0
    }
    
    private fun isAdbEnabled(context: Context): Boolean {
        return Settings.Global.getInt(
            context.contentResolver,
            Settings.Global.ADB_ENABLED,
            0
        ) != 0
    }
    
    private fun isUnknownSourcesEnabled(context: Context): Boolean {
        return try {
            Settings.Secure.getInt(
                context.contentResolver,
                Settings.Secure.INSTALL_NON_MARKET_APPS,
                0
            ) != 0
        } catch (e: Exception) {
            false
        }
    }
    
    private fun getAppVersion(context: Context): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName
        } catch (e: Exception) {
            "1.0.0"
        }
    }
    
    private fun getAllowedApps(context: Context): List<String> {
        return try {
            val sharedPreferences = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val gson = com.google.gson.Gson()
            val savedAllowedApps = sharedPreferences.getString("allowed_apps", null)
            
            Log.d("DeviceInfoCollector", "=== DEBUG: getAllowedApps ===")
            Log.d("DeviceInfoCollector", "SharedPreferences raw: $savedAllowedApps")
            
            if (savedAllowedApps != null) {
                val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
                val allowedApps = gson.fromJson<List<String>>(savedAllowedApps, type)
                Log.d("DeviceInfoCollector", "Apps permitidos carregados: ${allowedApps.size}")
                Log.d("DeviceInfoCollector", "Lista carregada: $allowedApps")
                allowedApps
            } else {
                Log.d("DeviceInfoCollector", "Nenhum app permitido encontrado")
                emptyList()
            }
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro ao carregar apps permitidos", e)
            emptyList()
        }
    }
    
    private fun getLocationInfo(context: Context): Octuple<String?, Double?, Double?, Float?, String?, Long?, String?, Int> {
        return try {
            Log.d("DeviceInfoCollector", "🔍 === COLETANDO INFORMAÇÕES DE LOCALIZAÇÃO ===")
            
            val history = LocationHistoryManager.loadLocationHistory(context)
            Log.d("DeviceInfoCollector", "Histórico carregado: ${history.size} entradas")
            
            val lastLocation = history.maxByOrNull { it.timestamp }
            Log.d("DeviceInfoCollector", "Última localização: $lastLocation")
            
            val locationString = if (lastLocation != null) {
                "${lastLocation.latitude},${lastLocation.longitude}"
            } else {
                null
            }
            
            Log.d("DeviceInfoCollector", "Location string: $locationString")
            Log.d("DeviceInfoCollector", "Latitude: ${lastLocation?.latitude}")
            Log.d("DeviceInfoCollector", "Longitude: ${lastLocation?.longitude}")
            Log.d("DeviceInfoCollector", "Accuracy: ${lastLocation?.accuracy}")
            Log.d("DeviceInfoCollector", "Provider: ${lastLocation?.provider}")
            Log.d("DeviceInfoCollector", "Timestamp: ${lastLocation?.timestamp}")
            Log.d("DeviceInfoCollector", "Address: ${lastLocation?.address}")
            Log.d("DeviceInfoCollector", "History size: ${history.size}")
            
            val result = Octuple(
                first = locationString,
                second = lastLocation?.latitude,
                third = lastLocation?.longitude,
                fourth = lastLocation?.accuracy,
                fifth = lastLocation?.provider,
                sixth = lastLocation?.timestamp,
                seventh = lastLocation?.address,
                eighth = history.size
            )
            
            Log.d("DeviceInfoCollector", "✅ Informações de localização coletadas com sucesso")
            Log.d("DeviceInfoCollector", "===============================================")
            
            result
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "❌ Erro ao obter informações de localização", e)
            Octuple(null, null, null, null, null, null, null, 0)
        }
    }
    
    // Classe para retornar 8 valores
    data class Octuple<A, B, C, D, E, F, G, H>(
        val first: A,
        val second: B,
        val third: C,
        val fourth: D,
        val fifth: E,
        val sixth: F,
        val seventh: G,
        val eighth: H
    )
}

// Classe auxiliar para retornar 4 valores
data class Quadruple<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D
)
