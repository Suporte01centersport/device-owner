package com.mdm.launcher.network

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import com.mdm.launcher.data.DeviceInfo
import com.mdm.launcher.data.DeviceRestrictions
import kotlinx.coroutines.*
import okhttp3.*
import java.util.concurrent.TimeUnit

class WebSocketClient private constructor(
    private val serverUrl: String,
    private val deviceId: String,
    private val onMessage: (String) -> Unit,
    private val onConnectionChange: (Boolean) -> Unit
) {
    private var client: OkHttpClient? = null
    private var webSocket: WebSocket? = null
    private var isConnected = false
    private val gson = Gson()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Sistema de reconexão automática melhorado
    private var reconnectAttempts = 0
    private var maxReconnectAttempts = 20 // Aumentado para ser mais persistente
    private var reconnectDelay = 1000L // 1s inicial
    private var maxReconnectDelay = 30000L // 30 segundos máximo
    private var isReconnecting = false
    private var heartbeatJob: Job? = null
    private var lastHeartbeat = 0L
    private var lastSuccessfulMessage = 0L
    private val heartbeatInterval = 30000L // 30 segundos - mais frequente para detectar desconexões
    private val connectionTimeout = 15000L // 15 segundos timeout - mais tolerante
    private var lastConnectionAttempt = 0L
    private val minReconnectInterval = 2000L // Mínimo 2s entre tentativas
    
    private val webSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket conectado")
            isConnected = true
            isReconnecting = false
            reconnectAttempts = 0
            reconnectDelay = 1000L
            onConnectionChange(true)
            
            // Iniciar sistema de heartbeat
            startHeartbeat()
            
            // Enviar identificação como dispositivo
            sendDeviceStatus()
        }
        
        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "Mensagem recebida: $text")
            lastSuccessfulMessage = System.currentTimeMillis()
            onMessage(text)
        }
        
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket fechando: $code - $reason")
            isConnected = false
            onConnectionChange(false)
        }
        
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket fechado: $code - $reason")
            isConnected = false
            onConnectionChange(false)
        }
        
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "Falha no WebSocket", t)
            isConnected = false
            onConnectionChange(false)
            
            // Parar heartbeat
            stopHeartbeat()
            
            // Tentar reconectar automaticamente imediatamente
            if (!isReconnecting) {
                scheduleReconnect()
            } else if (reconnectAttempts >= maxReconnectAttempts) {
                Log.w(TAG, "Máximo de tentativas de reconexão atingido")
            }
        }
    }
    
    fun connect() {
        if (isConnected) {
            Log.d(TAG, "Já conectado, ignorando nova tentativa de conexão")
            return
        }
        
        if (isReconnecting) {
            Log.d(TAG, "Reconexão já em andamento, ignorando nova tentativa")
            return
        }
        
        isReconnecting = true
        scope.launch {
            try {
                Log.d(TAG, "Tentativa de conexão #${reconnectAttempts + 1}")
                
                // Fechar conexões anteriores
                client?.dispatcher?.executorService?.shutdown()
                
                client = OkHttpClient.Builder()
                    .readTimeout(60, TimeUnit.SECONDS)
                    .connectTimeout(connectionTimeout, TimeUnit.MILLISECONDS)
                    .writeTimeout(60, TimeUnit.SECONDS)
                    .pingInterval(0, TimeUnit.MILLISECONDS) // Desabilitar ping automático do OkHttp
                    .retryOnConnectionFailure(true)
                    .build()
                
                val request = Request.Builder()
                    .url(serverUrl)
                    .build()
                
                webSocket = client?.newWebSocket(request, webSocketListener)
                
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao conectar WebSocket", e)
                onConnectionChange(false)
                isReconnecting = false
                
                // Tentar reconectar se não excedeu o limite
                if (reconnectAttempts < maxReconnectAttempts) {
                    scheduleReconnect()
                }
            }
        }
    }
    
    fun disconnect() {
        try {
            stopHeartbeat()
            webSocket?.close(1000, "Cliente desconectando")
            webSocket = null
            client?.dispatcher?.executorService?.shutdown()
            client = null
            isConnected = false
            isReconnecting = false
            onConnectionChange(false)
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao desconectar WebSocket", e)
        }
    }
    
    fun sendDeviceStatus(deviceInfo: DeviceInfo? = null) {
        if (!isConnected) return
        
        val message = mapOf(
            "type" to "device_status",
            "data" to (deviceInfo ?: getDefaultDeviceInfo())
        )
        
        sendMessage(gson.toJson(message))
    }
    
    fun sendPing() {
        if (!isConnected || webSocket == null) return
        
        try {
            val message = mapOf(
                "type" to "ping",
                "timestamp" to System.currentTimeMillis()
            )
            
            val jsonMessage = gson.toJson(message)
            val success = webSocket?.send(jsonMessage) ?: false
            
            if (!success) {
                Log.w(TAG, "Falha ao enviar ping - conexão pode estar instável")
                isConnected = false
                onConnectionChange(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar ping", e)
            isConnected = false
            onConnectionChange(false)
        }
    }
    
    fun sendRestrictions(restrictions: DeviceRestrictions) {
        if (!isConnected) return
        
        val message = mapOf(
            "type" to "device_restrictions",
            "data" to restrictions
        )
        
        sendMessage(gson.toJson(message))
    }
    
    fun sendMessage(message: String) {
        webSocket?.send(message)
    }
    
    private fun getDefaultDeviceInfo(): DeviceInfo {
        return DeviceInfo(
            deviceId = deviceId,
            name = android.os.Build.MODEL,
            model = android.os.Build.MODEL,
            manufacturer = android.os.Build.MANUFACTURER,
            androidVersion = android.os.Build.VERSION.RELEASE,
            apiLevel = android.os.Build.VERSION.SDK_INT,
            serialNumber = android.os.Build.SERIAL,
            imei = null,
            macAddress = null,
            ipAddress = null,
            batteryLevel = 0,
            batteryStatus = "unknown",
            isCharging = false,
            storageTotal = 0,
            storageUsed = 0,
            memoryTotal = 0,
            memoryUsed = 0,
            cpuArchitecture = android.os.Build.CPU_ABI,
            screenResolution = "unknown",
            screenDensity = 0,
            networkType = "unknown",
            wifiSSID = null,
            isWifiEnabled = false,
            isBluetoothEnabled = false,
            isLocationEnabled = false,
            isDeveloperOptionsEnabled = false,
            isAdbEnabled = false,
            isUnknownSourcesEnabled = false,
            installedAppsCount = 0,
            isDeviceOwner = false,
            isProfileOwner = false,
            appVersion = "1.0.0",
            timezone = "unknown",
            language = "unknown",
            country = "unknown"
        )
    }
    
    fun isConnected(): Boolean = isConnected
    
    fun forceReconnect() {
        Log.d(TAG, "Forçando reconexão...")
        disconnect()
        reconnectAttempts = 0
        isReconnecting = false
        lastConnectionAttempt = 0L // Reset para permitir reconexão imediata
        connect()
    }
    
    fun checkConnectionHealth(): Boolean {
        val now = System.currentTimeMillis()
        val timeSinceLastMessage = now - lastSuccessfulMessage
        
        Log.d(TAG, "Verificando saúde da conexão: isConnected=$isConnected, última mensagem há ${timeSinceLastMessage/1000}s")
        
        // Se não está conectado, tentar reconectar
        if (!isConnected) {
            Log.d(TAG, "Conexão perdida, tentando reconectar...")
            forceReconnect()
            return false
        }
        
        // Se não recebeu mensagens há muito tempo, considerar conexão morta
        if (lastSuccessfulMessage > 0 && timeSinceLastMessage > (heartbeatInterval * 2)) {
            Log.w(TAG, "Conexão pode estar morta (sem mensagens há ${timeSinceLastMessage/1000}s), forçando reconexão")
            forceReconnect()
            return false
        }
        
        return true
    }
    
    fun resetReconnectAttempts() {
        reconnectAttempts = 0
        reconnectDelay = 1000L
    }
    
    private fun scheduleReconnect() {
        val currentTime = System.currentTimeMillis()
        
        // Evitar tentativas muito frequentes
        if (currentTime - lastConnectionAttempt < minReconnectInterval) {
            Log.d(TAG, "Tentativa de reconexão muito recente, aguardando...")
            scope.launch {
                delay(minReconnectInterval)
                if (!isConnected) {
                    scheduleReconnect()
                }
            }
            return
        }
        
        if (isReconnecting) {
            Log.d(TAG, "Reconexão já em andamento, ignorando nova tentativa")
            return
        }
        
        if (reconnectAttempts >= maxReconnectAttempts) {
            Log.w(TAG, "Máximo de tentativas de reconexão atingido ($maxReconnectAttempts)")
            // Reset após um tempo para permitir novas tentativas
            scope.launch {
                delay(60000L) // 1 minuto
                Log.d(TAG, "Resetando tentativas de reconexão após timeout")
                reconnectAttempts = 0
                if (!isConnected) {
                    scheduleReconnect()
                }
            }
            return
        }
        
        reconnectAttempts++
        // Backoff exponencial com jitter para evitar thundering herd
        val baseDelay = minOf(reconnectDelay * (1 shl (reconnectAttempts - 1)), maxReconnectDelay)
        val jitter = (Math.random() * 1000).toLong()
        val delay = baseDelay + jitter
        
        Log.d(TAG, "Agendando reconexão em ${delay}ms (tentativa $reconnectAttempts/$maxReconnectAttempts)")
        
        isReconnecting = true
        lastConnectionAttempt = currentTime
        scope.launch {
            delay(delay)
            if (!isConnected && isReconnecting) {
                isReconnecting = false
                connect()
            }
        }
    }
    
    private fun startHeartbeat() {
        stopHeartbeat() // Parar heartbeat anterior se existir
        
        lastSuccessfulMessage = System.currentTimeMillis() // Reset do timestamp
        
        heartbeatJob = scope.launch {
            while (isConnected && isActive) {
                try {
                    val now = System.currentTimeMillis()
                    
                    // Verificar se não recebemos resposta há muito tempo (mais tolerante)
                    if (lastSuccessfulMessage > 0 && (now - lastSuccessfulMessage) > (heartbeatInterval * 3)) {
                        Log.w(TAG, "Não recebemos resposta há muito tempo (${(now - lastSuccessfulMessage)/1000}s), forçando reconexão")
                        isConnected = false
                        onConnectionChange(false)
                        stopHeartbeat()
                        scheduleReconnect()
                        break
                    }
                    
                    // Verificar se a conexão WebSocket ainda está aberta
                    val currentWebSocket = webSocket
                    if (currentWebSocket == null || currentWebSocket.request().url.host.isEmpty()) {
                        Log.w(TAG, "WebSocket inválido detectado, forçando reconexão")
                        isConnected = false
                        onConnectionChange(false)
                        stopHeartbeat()
                        scheduleReconnect()
                        break
                    }
                    
                    sendPing()
                    lastHeartbeat = now
                    Log.d(TAG, "Heartbeat enviado (última resposta há ${(now - lastSuccessfulMessage)/1000}s)")
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao enviar heartbeat: ${e.message}")
                    // Se falhou ao enviar, considerar desconectado
                    isConnected = false
                    onConnectionChange(false)
                    stopHeartbeat()
                    scheduleReconnect()
                    break
                }
                delay(heartbeatInterval)
            }
        }
    }
    
    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }
    
    
    companion object {
        private const val TAG = "WebSocketClient"
        @Volatile
        private var INSTANCE: WebSocketClient? = null
        
        fun getInstance(
            serverUrl: String,
            deviceId: String,
            onMessage: (String) -> Unit,
            onConnectionChange: (Boolean) -> Unit
        ): WebSocketClient {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: WebSocketClient(serverUrl, deviceId, onMessage, onConnectionChange).also { INSTANCE = it }
            }
        }
        
        fun destroyInstance() {
            synchronized(this) {
                INSTANCE?.disconnect()
                INSTANCE = null
            }
        }
    }
}
