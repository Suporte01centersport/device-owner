package com.mdm.launcher.utils

import android.os.Build
import java.io.File

object RootDetector {
    fun isDeviceRooted(): Boolean {
        return checkRootBinaries() || checkSuExists() || checkBuildTags() || checkDangerousProps()
    }

    private fun checkRootBinaries(): Boolean {
        val paths = arrayOf(
            "/system/app/Superuser.apk", "/sbin/su", "/system/bin/su",
            "/system/xbin/su", "/data/local/xbin/su", "/data/local/bin/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su", "/data/local/su",
            "/su/bin/su", "/system/app/SuperSU.apk", "/system/app/SuperSU",
            "/system/xbin/daemonsu", "/system/etc/.installed_su_daemon",
            "/dev/com.koushikdutta.superuser.daemon/"
        )
        return paths.any { File(it).exists() }
    }

    private fun checkSuExists(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
            process.inputStream.bufferedReader().readLine() != null
        } catch (e: Exception) { false }
    }

    private fun checkBuildTags(): Boolean {
        return Build.TAGS?.contains("test-keys") == true
    }

    private fun checkDangerousProps(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.debuggable"))
            val result = process.inputStream.bufferedReader().readLine()
            result == "1"
        } catch (e: Exception) { false }
    }
}
