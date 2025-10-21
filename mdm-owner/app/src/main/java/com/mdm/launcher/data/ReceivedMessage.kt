package com.mdm.launcher.data

data class ReceivedMessage(
    val id: String,
    val message: String,
    val timestamp: Long,
    val read: Boolean = false
)


