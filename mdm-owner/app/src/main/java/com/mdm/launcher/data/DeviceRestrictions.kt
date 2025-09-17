package com.mdm.launcher.data

data class DeviceRestrictions(
    val wifiDisabled: Boolean = false,
    val bluetoothDisabled: Boolean = false,
    val cameraDisabled: Boolean = false,
    val statusBarDisabled: Boolean = false,
    val installAppsDisabled: Boolean = false,
    val uninstallAppsDisabled: Boolean = false,
    val settingsDisabled: Boolean = false,
    val systemNotificationsDisabled: Boolean = false,
    val screenCaptureDisabled: Boolean = false,
    val sharingDisabled: Boolean = false,
    val outgoingCallsDisabled: Boolean = false,
    val smsDisabled: Boolean = false,
    val userCreationDisabled: Boolean = false,
    val userRemovalDisabled: Boolean = false
)
