package com.mdm.launcher.service

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.gson.Gson
import com.mdm.launcher.R
import com.mdm.launcher.data.DeviceInfo
import kotlinx.coroutines.*
import okhttp3.*
import java.util.concurrent.TimeUnit

class WebSocketService : Service() {

    inner class LocalBinder : android.os.Binder() {
        fun getService(): WebSocketService = this@WebSocketService
    }

    private val binder = LocalBinder()

    companion object {
        private const val TAG = "MDM-WebSocket"
        private const val CHANNEL_ID = "mdm_ws_channel"
        private const val NOTIFICATION_ID = 1001

        // MUDA PRA URL DO SEU BACKEND
        private const val WS_URL = "ws://192.168.2.199:3002/ws"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gson = Gson()

    private var webSocket: WebSocket? = null
    private lateinit var client: OkHttpClient
    private var isScreenActive = true

    fun isConnected(): Boolean = webSocket != null

    fun sendMessage(message: String) {
        webSocket?.send(message)
    }

    fun sendDeviceStatus(deviceInfo: DeviceInfo? = null) {
        if (!isConnected()) return
        val data = deviceInfo ?: return
        val message = mapOf("type" to "device_status", "data" to data)
        sendMessage(gson.toJson(message))
    }

    fun setScreenActive(active: Boolean) {
        isScreenActive = active
    }

    fun onNetworkChanged() {
        serviceScope.launch {
            webSocket?.close(1000, "Network changed")
            delay(1000)
            connectWebSocket()
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Service criado")

        startAsForeground()
        initClient()
        connectWebSocket()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand chamado")
        return START_STICKY
    }

    override fun onDestroy() {
        Log.w(TAG, "Service destruído, fechando socket")
        webSocket?.close(1000, "Service destroyed")
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = binder

    // ==============================
    // FOREGROUND
    // ==============================

    private fun startAsForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MDM WebSocket",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM ativo")
            .setContentText("Conectando ao servidor...")
            .setSmallIcon(R.drawable.ic_service_notification)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    // ==============================
    // WEBSOCKET
    // ==============================

    private fun initClient() {
        client = OkHttpClient.Builder()
            .pingInterval(20, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private fun connectWebSocket() {
        serviceScope.launch {
            Log.i(TAG, "Tentando conectar WebSocket...")

            val request = Request.Builder()
                .url(WS_URL)
                .build()

            webSocket = client.newWebSocket(request, socketListener)
        }
    }

    private val socketListener = object : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.i(TAG, "WebSocket conectado")

            updateNotification("Conectado ao servidor")

            // EXEMPLO DE MENSAGEM DE IDENTIFICAÇÃO
            webSocket.send("""{"type":"HELLO","platform":"android"}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "Mensagem recebida: $text")
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.w(TAG, "WebSocket fechando: $code / $reason")
            webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.w(TAG, "WebSocket fechado: $code / $reason")
            reconnectWithDelay()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "Erro WebSocket: ${t.message}", t)
            reconnectWithDelay()
        }
    }

    // ==============================
    // RECONEXÃO AUTOMÁTICA
    // ==============================

    private fun reconnectWithDelay() {
        serviceScope.launch {
            delay(5000)
            Log.i(TAG, "Tentando reconectar WebSocket...")
            connectWebSocket()
        }
    }

    // ==============================
    // NOTIFICATION UPDATE
    // ==============================

    private fun updateNotification(text: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MDM ativo")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_service_notification)
            .setOngoing(true)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }
}