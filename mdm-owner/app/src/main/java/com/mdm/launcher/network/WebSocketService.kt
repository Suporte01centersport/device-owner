package com.mdm.launcher.network

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mdm.launcher.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.data.DeviceRestrictions
import com.mdm.launcher.utils.DeviceInfoCollector
import kotlinx.coroutines.*

class WebSocketService : Service() {
    
    private var webSocketClient: WebSocketClient? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isServiceRunning = false
    
    companion object {
        private const val TAG = "WebSocketService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "mdm_launcher_channel"
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START" -> startService()
            "STOP" -> stopService()
        }
        return START_STICKY
    }
    
    private fun startService() {
        if (isServiceRunning) return
        
        isServiceRunning = true
        startForeground(NOTIFICATION_ID, createNotification())
        
        serviceScope.launch {
            try {
                val serverUrl = getServerUrl()
                val deviceId = getDeviceIdValue()
                
                webSocketClient = WebSocketClient.getInstance(
                    serverUrl = serverUrl,
                    deviceId = deviceId,
                    onMessage = { message -> handleWebSocketMessage(message) },
                    onConnectionChange = { connected -> updateConnectionStatus(connected) }
                )
                
                webSocketClient?.connect()
                
                // Monitorar conexão e reconectar se necessário
                while (isServiceRunning) {
                    delay(10000) // Verificar a cada 10 segundos
                    
                    if (!webSocketClient?.isConnected()!!) {
                        Log.w(TAG, "Conexão perdida, tentando reconectar...")
                        webSocketClient?.forceReconnect()
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Erro no serviço WebSocket", e)
                // Tentar reiniciar o serviço em caso de erro
                if (isServiceRunning) {
                    delay(5000)
                    startService()
                }
            }
        }
    }
    
    private fun stopService() {
        isServiceRunning = false
        webSocketClient?.disconnect()
        stopForeground(true)
        stopSelf()
    }
    
    private fun handleWebSocketMessage(message: String) {
        try {
            // Processar mensagens do servidor
            Log.d(TAG, "Processando mensagem: $message")
            // Aqui você pode adicionar lógica para processar diferentes tipos de mensagens
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem WebSocket", e)
        }
    }
    
    private fun updateConnectionStatus(connected: Boolean) {
        val notification = createNotification(connected)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
    
    private fun createNotification(connected: Boolean = false): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(
                if (connected) getString(R.string.connected) 
                else getString(R.string.disconnected)
            )
            .setSmallIcon(R.drawable.ic_android)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_description)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun getServerUrl(): String {
        val prefs = getSharedPreferences("mdm_config", Context.MODE_PRIVATE)
        return prefs.getString("server_url", "ws://10.0.2.2:3002") ?: "ws://10.0.2.2:3002"
    }
    
    private fun getDeviceIdValue(): String {
        val prefs = getSharedPreferences("mdm_config", Context.MODE_PRIVATE)
        return prefs.getString("device_id", android.os.Build.SERIAL) ?: android.os.Build.SERIAL
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        webSocketClient?.disconnect()
        serviceScope.cancel()
    }
}
