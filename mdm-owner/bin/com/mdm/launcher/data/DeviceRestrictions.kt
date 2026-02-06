package com.mdm.launcher.data

import com.google.gson.annotations.SerializedName

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
    val userRemovalDisabled: Boolean = false,
    @SerializedName("allowedLocation")
    val allowedLocation: AllowedLocation? = null
)

data class AllowedLocation(
    val latitude: Double,
    val longitude: Double,
    @SerializedName("radius_km")
    val radiusKm: Double,
    val enabled: Boolean? = true
)
