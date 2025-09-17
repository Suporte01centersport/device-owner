package com.mdm.launcher.data

import android.graphics.drawable.Drawable

data class AppInfo(
    val packageName: String,
    val appName: String,
    val icon: Drawable?,
    val iconBase64: String? = null,
    val isSystemApp: Boolean = false,
    val isEnabled: Boolean = true,
    val versionName: String? = null,
    val versionCode: Long = 0,
    val installTime: Long = 0,
    val updateTime: Long = 0,
    val isAllowed: Boolean = false
)
