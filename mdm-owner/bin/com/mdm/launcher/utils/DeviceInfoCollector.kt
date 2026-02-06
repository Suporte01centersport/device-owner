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
import android.util.Log
import androidx.core.app.ActivityCompat
import com.mdm.launcher.data.AppInfo
import com.mdm.launcher.data.DeviceInfo
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
        
        deviceInfo
    }
    
    private fun getDeviceId(context: Context): String {
        return DeviceIdManager.getDeviceId(context)
    }
    
    private fun getBatteryInfo(context: Context): Triple<Int, String, Boolean> {
        return try {
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            
            val batteryLevel = try {
                val level = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                if (level == Int.MIN_VALUE || level < 0) 85 else level
            } catch (e: Exception) { 85 }
            
            val batteryStatus = try {
                val status = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
                when (status) {
                    BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
                    BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
                    BatteryManager.BATTERY_STATUS_FULL -> "full"
                    BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
                    else -> "unknown"
                }
            } catch (e: Exception) { "unknown" }
            
            val isCharging = batteryStatus == "charging"
            Triple(batteryLevel, batteryStatus, isCharging)
        } catch (e: Exception) {
            Triple(85, "unknown", false)
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
            
            if (total <= 0 || used < 0) {
                Pair(32L * 1024 * 1024 * 1024, 15L * 1024 * 1024 * 1024)
            } else {
                Pair(total, used)
            }
        } catch (e: Exception) {
            Pair(32L * 1024 * 1024 * 1024, 15L * 1024 * 1024 * 1024)
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
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
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
        
        val relevantPackages = packages.filter { packageInfo ->
            val appInfo = packageInfo.applicationInfo
            val isEnabled = appInfo.enabled
            val hasLaunchIntent = packageManager.getLaunchIntentForPackage(packageInfo.packageName) != null
            val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val isUpdatedSystemApp = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            
            hasLaunchIntent && isEnabled && (!isSystemApp || isUpdatedSystemApp || isCommonLauncherSystemApp(packageInfo.packageName))
        }
        
        for (packageInfo in relevantPackages) {
            val appInfo = packageInfo.applicationInfo
            val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val isUpdatedSystemApp = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            val isEnabled = appInfo.enabled
            
            try {
                val icon = appInfo.loadIcon(packageManager)
                val iconBase64 = IconUtils.convertDrawableToBase64(icon) ?: ""
                
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
                    isAllowed = false
                )
                
                apps.add(app)
            } catch (e: Exception) {
                Log.w("DeviceInfoCollector", "Erro ao processar app ${packageInfo.packageName}: ${e.message}")
            }
        }
        
        return apps.sortedBy { it.appName }
    }
    
    private fun isCommonLauncherSystemApp(packageName: String): Boolean {
        val commonLauncherApps = listOf(
            "com.google.android.apps.maps", "com.google.android.gm", "com.google.android.youtube",
            "com.google.android.apps.photos", "com.google.android.apps.docs", "com.google.android.apps.drive",
            "com.google.android.apps.messaging", "com.google.android.calendar", "com.android.calculator2",
            "com.android.settings", "com.android.vending", "com.android.chrome"
        )
        return commonLauncherApps.any { packageName.startsWith(it) }
    }
    
    private fun getSerialNumber(context: Context): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try { Build.getSerial() } catch (e: SecurityException) { null }
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
        } catch (e: Exception) { null }
    }
    
    private fun getImei(context: Context): String? {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try { telephonyManager.imei } catch (e: SecurityException) { null }
            } else {
                @Suppress("DEPRECATION")
                telephonyManager.deviceId
            }
        } catch (e: Exception) { null }
    }
    
    private fun getMeid(context: Context): String? {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try { telephonyManager.meid } catch (e: Exception) { null }
            } else null
        } catch (e: Exception) { null }
    }
    
    private fun getMacAddress(context: Context): String? {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            wifiManager.connectionInfo.macAddress
        } catch (e: Exception) { null }
    }
    
    private fun getIpAddress(context: Context): String? {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            val ipInt = wifiManager.connectionInfo.ipAddress
            if (ipInt != 0) {
                String.format("%d.%d.%d.%d", ipInt and 0xff, ipInt shr 8 and 0xff, ipInt shr 16 and 0xff, ipInt shr 24 and 0xff)
            } else null
        } catch (e: Exception) { null }
    }
    
    private fun getScreenResolution(context: Context): String {
        val displayMetrics = context.resources.displayMetrics
        return "${displayMetrics.widthPixels}x${displayMetrics.heightPixels}"
    }
    
    private fun isBluetoothEnabled(context: Context): Boolean {
        return try {
            val adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            adapter?.isEnabled ?: false
        } catch (e: Exception) { false }
    }
    
    private fun isLocationEnabled(context: Context): Boolean {
        return try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } catch (e: Exception) { false }
    }
    
    private fun isDeveloperOptionsEnabled(context: Context): Boolean {
        return Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0
    }
    
    private fun isAdbEnabled(context: Context): Boolean {
        return Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) != 0
    }
    
    private fun isUnknownSourcesEnabled(context: Context): Boolean {
        return try {
            Settings.Secure.getInt(context.contentResolver, Settings.Secure.INSTALL_NON_MARKET_APPS, 0) != 0
        } catch (e: Exception) { false }
    }
    
    private fun getAppVersion(context: Context): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) { "1.0.0" }
    }
    
    private fun getAllowedApps(context: Context): List<String> {
        return try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val json = prefs.getString("allowed_apps", null)
            if (json != null) {
                val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
                com.google.gson.Gson().fromJson<List<String>>(json, type) ?: emptyList()
            } else emptyList()
        } catch (e: Exception) { emptyList() }
    }
    
    private fun getLocationInfo(context: Context): Octuple<String?, Double?, Double?, Float?, String?, Long?, String?, Int> {
        val history = LocationHistoryManager.loadLocationHistory(context)
        val lastEntry = history.maxByOrNull { it.timestamp }
        
        return Octuple(
            first = lastEntry?.let { "${it.latitude},${it.longitude}" },
            second = lastEntry?.latitude,
            third = lastEntry?.longitude,
            fourth = lastEntry?.accuracy,
            fifth = lastEntry?.provider,
            sixth = lastEntry?.timestamp,
            seventh = lastEntry?.address,
            eighth = history.size
        )
    }
    
    data class Octuple<A, B, C, D, E, F, G, H>(val first: A, val second: B, val third: C, val fourth: D, val fifth: E, val sixth: F, val seventh: G, val eighth: H)
    
    private fun calculateComplianceStatus(context: Context, isDeviceOwner: Boolean, isDeveloperOptionsEnabled: Boolean, isAdbEnabled: Boolean, isUnknownSourcesEnabled: Boolean): String {
        if (!isDeviceOwner) return "non_compliant"
        if (isDeveloperOptionsEnabled && !Build.TYPE.equals("eng", ignoreCase = true)) return "non_compliant"
        if (isAdbEnabled && !Build.TYPE.equals("eng", ignoreCase = true)) return "non_compliant"
        if (isUnknownSourcesEnabled) return "non_compliant"
        return "compliant"
    }
}
