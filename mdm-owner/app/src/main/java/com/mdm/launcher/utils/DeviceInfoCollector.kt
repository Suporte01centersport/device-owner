package com.mdm.launcher.utils

import android.Manifest
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.StatFs
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.ActivityCompat
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
        
        val isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(context.packageName)
        val isProfileOwner = devicePolicyManager.isProfileOwnerApp(context.packageName)
        val serialNumber = getSerialNumber(context)
        val imei = getImei(context)
        val meid = getMeid(context)
        val complianceStatus = calculateComplianceStatus(
            context = context,
            isDeviceOwner = isDeviceOwner,
            isDeveloperOptionsEnabled = isDeveloperOptionsEnabled(context),
            isAdbEnabled = isAdbEnabled(context),
            isUnknownSourcesEnabled = isUnknownSourcesEnabled(context)
        )
        
        // ========== LOG DE DEBUG: DADOS COLETADOS ==========
        Log.i("DeviceInfoCollector", "╔═══════════════════════════════════════════════════════════════")
        Log.i("DeviceInfoCollector", "║ DADOS DO DISPOSITIVO COLETADOS")
        Log.i("DeviceInfoCollector", "╠═══════════════════════════════════════════════════════════════")
        Log.i("DeviceInfoCollector", "║ DeviceId: ${deviceId.takeLast(12)}")
        Log.i("DeviceInfoCollector", "║ Manufacturer: ${Build.MANUFACTURER}")
        Log.i("DeviceInfoCollector", "║ Model: ${Build.MODEL}")
        Log.i("DeviceInfoCollector", "║ Android Version: ${Build.VERSION.RELEASE}")
        Log.i("DeviceInfoCollector", "║ OS Type: Android")
        Log.i("DeviceInfoCollector", "║ API Level: ${Build.VERSION.SDK_INT}")
        Log.i("DeviceInfoCollector", "║ Serial Number: ${serialNumber ?: "N/A"}")
        Log.i("DeviceInfoCollector", "║ IMEI: ${imei ?: "N/A"}")
        Log.i("DeviceInfoCollector", "║ MEID: ${meid ?: "N/A"}")
        Log.i("DeviceInfoCollector", "║ Compliance Status: $complianceStatus")
        Log.i("DeviceInfoCollector", "║ Is Device Owner: $isDeviceOwner")
        Log.i("DeviceInfoCollector", "║ Is Profile Owner: $isProfileOwner")
        Log.i("DeviceInfoCollector", "║ Battery Level: ${batteryInfo.first}%")
        Log.i("DeviceInfoCollector", "║ Battery Status: ${batteryInfo.second}")
        Log.i("DeviceInfoCollector", "║ Storage Total: ${storageInfo.first / (1024 * 1024 * 1024)}GB")
        Log.i("DeviceInfoCollector", "║ Storage Used: ${storageInfo.second / (1024 * 1024 * 1024)}GB")
        Log.i("DeviceInfoCollector", "║ Network Type: ${networkInfo.first}")
        Log.i("DeviceInfoCollector", "║ WiFi SSID: ${networkInfo.second ?: "N/A"}")
        Log.i("DeviceInfoCollector", "║ Installed Apps: ${installedApps.size}")
        Log.i("DeviceInfoCollector", "║ Location: ${if (locationInfo.second != null && locationInfo.third != null) "${locationInfo.second}, ${locationInfo.third}" else "N/A"}")
        Log.i("DeviceInfoCollector", "╚═══════════════════════════════════════════════════════════════")
        
        val deviceInfo = DeviceInfo(
            deviceId = deviceId,
            name = customName ?: Build.MODEL,
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            androidVersion = Build.VERSION.RELEASE,
            osType = "Android",
            apiLevel = Build.VERSION.SDK_INT,
            serialNumber = serialNumber,
            imei = imei,
            meid = meid,
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
            isDeviceOwner = isDeviceOwner,
            isProfileOwner = isProfileOwner,
            appVersion = getAppVersion(context),
            timezone = TimeZone.getDefault().id,
            language = Locale.getDefault().language,
            country = Locale.getDefault().country,
            complianceStatus = complianceStatus,
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
        
        Log.i("DeviceInfoCollector", "✅ DeviceInfo criado e pronto para envio ao servidor")
        
        deviceInfo
    }
    
    private fun getDeviceId(context: Context): String {
        // Usar o DeviceIdManager para obter um ID persistente e confiável
        val deviceId = DeviceIdManager.getDeviceId(context)
        Log.d("DeviceInfoCollector", "DeviceId obtido: ${deviceId.takeLast(8)}")
        
        // Log adicional para debug
        val deviceIdInfo = DeviceIdManager.getDeviceIdInfo(context)
        Log.d("DeviceInfoCollector", "Fonte do DeviceId: ${deviceIdInfo["source"]}")
        
        return deviceId
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
            val appInfo = packageInfo.applicationInfo ?: return@filter false
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
            val appInfo = packageInfo.applicationInfo ?: continue
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
            val appInfo = packageInfo.applicationInfo ?: continue
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
    
    fun getPublicSerialNumber(context: Context): String? {
        return getSerialNumber(context)
    }
    
    private fun getSerialNumber(context: Context): String? {
        return try {
            var serial: String? = null
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val buildSerial = Build.getSerial()
                    if (buildSerial != "unknown" && buildSerial.isNotEmpty()) {
                        serial = buildSerial
                    }
                } catch (e: SecurityException) {
                    // Ignorar
                }
            }
            
            if (serial == null) {
                try {
                    @Suppress("DEPRECATION")
                    val buildSerialFallback = Build.SERIAL
                    if (buildSerialFallback != "unknown" && buildSerialFallback.isNotEmpty()) {
                        serial = buildSerialFallback
                    }
                } catch (e: Exception) {
                    // Ignorar
                }
            }
            
            if (serial == null) {
                try {
                    val androidId = android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID)
                    if (androidId.isNotEmpty() && androidId != "9774d56d682e549c") {
                        serial = androidId
                    }
                } catch (e: Exception) {
                    // Ignorar
                }
            }
            
            if (serial == null) {
                serial = "unknown_device_${System.currentTimeMillis() % 10000}"
            }
            
            serial
            
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro ao obter Serial: ${e.message}")
            "error_device_${System.currentTimeMillis() % 10000}"
        }
    }
    
    private fun getImei(context: Context): String? {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            
            val imei = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                null // Android 10+ requer permissões privilegiadas
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val imeiValue = telephonyManager.imei
                    if (imeiValue != null && imeiValue.isNotEmpty() && imeiValue != "unknown") imeiValue else null
                } catch (e: SecurityException) {
                    null
                }
            } else {
                @Suppress("DEPRECATION")
                try {
                    val deviceId = telephonyManager.deviceId
                    if (deviceId != null && deviceId.isNotEmpty() && deviceId != "unknown") deviceId else null
                } catch (e: SecurityException) {
                    null
                }
            }
            
            imei
        } catch (e: Exception) {
            null
        }
    }
    
    private fun getMeid(context: Context): String? {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val meidValue = telephonyManager.meid
                    if (meidValue != null && meidValue.isNotEmpty() && meidValue != "unknown") meidValue else null
                } catch (e: Exception) {
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
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
            packageInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }
    
    private fun getAllowedApps(context: Context): List<String> {
        return try {
            val sharedPreferences = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val gson = com.google.gson.Gson()
            val savedAllowedApps = sharedPreferences.getString("allowed_apps", null)
            
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
            
            // Verificar permissões primeiro
            val hasFineLocation = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasCoarseLocation = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            
            Log.d("DeviceInfoCollector", "Permissões de localização:")
            Log.d("DeviceInfoCollector", "ACCESS_FINE_LOCATION: $hasFineLocation")
            Log.d("DeviceInfoCollector", "ACCESS_COARSE_LOCATION: $hasCoarseLocation")
            
            if (!hasFineLocation && !hasCoarseLocation) {
                Log.w("DeviceInfoCollector", "❌ Nenhuma permissão de localização concedida")
                return Octuple(null, null, null, null, null, null, null, 0)
            }
            
            // Verificar se GPS está habilitado
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            
            Log.d("DeviceInfoCollector", "Provedores de localização:")
            Log.d("DeviceInfoCollector", "GPS habilitado: $isGpsEnabled")
            Log.d("DeviceInfoCollector", "Network habilitado: $isNetworkEnabled")
            
            if (!isGpsEnabled && !isNetworkEnabled) {
                Log.w("DeviceInfoCollector", "❌ Nenhum provedor de localização habilitado")
            }
            
            // Tentar obter última localização conhecida
            var lastKnownLocation: Location? = null
            try {
                if (isGpsEnabled) {
                    lastKnownLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    Log.d("DeviceInfoCollector", "📍 Última localização GPS: $lastKnownLocation")
                }
                
                if (lastKnownLocation == null && isNetworkEnabled) {
                    lastKnownLocation = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    Log.d("DeviceInfoCollector", "📍 Última localização Network: $lastKnownLocation")
                }
            } catch (e: SecurityException) {
                Log.w("DeviceInfoCollector", "SecurityException ao obter última localização: ${e.message}")
            } catch (e: Exception) {
                Log.w("DeviceInfoCollector", "Erro ao obter última localização: ${e.message}")
            }
            
            // Carregar histórico
            val history = LocationHistoryManager.loadLocationHistory(context)
            Log.d("DeviceInfoCollector", "Histórico carregado: ${history.size} entradas")
            
            val lastLocation = history.maxByOrNull { it.timestamp }
            Log.d("DeviceInfoCollector", "Última localização do histórico: $lastLocation")
            
            // Usar última localização conhecida se não há histórico
            val finalLocation = lastLocation ?: if (lastKnownLocation != null) {
                Log.d("DeviceInfoCollector", "✅ Usando última localização conhecida do sistema")
                LocationEntry(
                    latitude = lastKnownLocation.latitude,
                    longitude = lastKnownLocation.longitude,
                    accuracy = lastKnownLocation.accuracy,
                    timestamp = lastKnownLocation.time,
                    provider = lastKnownLocation.provider ?: "unknown"
                )
            } else {
                Log.w("DeviceInfoCollector", "❌ Nenhuma localização disponível")
                null
            }
            
            val locationString = if (finalLocation != null) {
                "${finalLocation.latitude},${finalLocation.longitude}"
            } else {
                null
            }
            
            Log.d("DeviceInfoCollector", "Location string: $locationString")
            Log.d("DeviceInfoCollector", "Latitude: ${finalLocation?.latitude}")
            Log.d("DeviceInfoCollector", "Longitude: ${finalLocation?.longitude}")
            Log.d("DeviceInfoCollector", "Accuracy: ${finalLocation?.accuracy}")
            Log.d("DeviceInfoCollector", "Provider: ${finalLocation?.provider}")
            Log.d("DeviceInfoCollector", "Timestamp: ${finalLocation?.timestamp}")
            Log.d("DeviceInfoCollector", "Address: ${finalLocation?.address}")
            Log.d("DeviceInfoCollector", "History size: ${history.size}")
            
            val result = Octuple(
                first = locationString,
                second = finalLocation?.latitude,
                third = finalLocation?.longitude,
                fourth = finalLocation?.accuracy,
                fifth = finalLocation?.provider,
                sixth = finalLocation?.timestamp,
                seventh = finalLocation?.address,
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
    
    /**
     * Calcula o status de conformidade do dispositivo baseado em políticas de segurança
     * 
     * Critérios de conformidade:
     * - Dispositivo deve ser Device Owner
     * - Opções de desenvolvedor devem estar desabilitadas (em produção)
     * - ADB não deve estar habilitado (em produção)
     * - Instalação de fontes desconhecidas deve estar desabilitada
     * 
     * @return "compliant", "non_compliant" ou "unknown"
     */
    private fun calculateComplianceStatus(
        context: Context,
        isDeviceOwner: Boolean,
        isDeveloperOptionsEnabled: Boolean,
        isAdbEnabled: Boolean,
        isUnknownSourcesEnabled: Boolean
    ): String {
        return try {
            val complianceIssues = mutableListOf<String>()
            
            Log.i("DeviceInfoCollector", "╔═══════════════════════════════════════════════════════════════")
            Log.i("DeviceInfoCollector", "║ CALCULANDO COMPLIANCE STATUS")
            Log.i("DeviceInfoCollector", "╠═══════════════════════════════════════════════════════════════")
            Log.i("DeviceInfoCollector", "║ Device Owner: $isDeviceOwner")
            Log.i("DeviceInfoCollector", "║ Developer Options: $isDeveloperOptionsEnabled")
            Log.i("DeviceInfoCollector", "║ ADB Enabled: $isAdbEnabled")
            Log.i("DeviceInfoCollector", "║ Unknown Sources: $isUnknownSourcesEnabled")
            Log.i("DeviceInfoCollector", "║ Build Type: ${Build.TYPE}")
            
            if (!isDeviceOwner) {
                complianceIssues.add("Não é Device Owner")
            }
            
            if (isDeveloperOptionsEnabled && !Build.TYPE.equals("eng", ignoreCase = true)) {
                complianceIssues.add("Opções de desenvolvedor habilitadas")
            }
            
            if (isAdbEnabled && !Build.TYPE.equals("eng", ignoreCase = true)) {
                complianceIssues.add("ADB habilitado")
            }
            
            if (isUnknownSourcesEnabled) {
                complianceIssues.add("Fontes desconhecidas habilitadas")
            }
            
            val status = when {
                complianceIssues.isEmpty() -> "compliant"
                !isDeviceOwner -> "non_compliant"
                else -> "non_compliant"
            }
            
            if (complianceIssues.isNotEmpty()) {
                Log.w("DeviceInfoCollector", "║ ⚠️  PROBLEMAS DE CONFORMIDADE:")
                complianceIssues.forEach { issue ->
                    Log.w("DeviceInfoCollector", "║    - $issue")
                }
            } else {
                Log.i("DeviceInfoCollector", "║ ✅ Nenhum problema de conformidade detectado")
            }
            
            Log.i("DeviceInfoCollector", "║ Status Final: $status")
            Log.i("DeviceInfoCollector", "╚═══════════════════════════════════════════════════════════════")
            
            status
            
        } catch (e: Exception) {
            Log.e("DeviceInfoCollector", "Erro ao calcular conformidade", e)
            "unknown"
        }
    }
}

// Classe auxiliar para retornar 4 valores
data class Quadruple<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D
)
