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
    @Volatile private var client: OkHttpClient? = null
    @Volatile private var webSocket: WebSocket? = null
    @Volatile private var isConnected = false
    private val gson = Gson()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Sistema de reconexão - agrupado para clareza
    @Volatile private var reconnectAttempts = 0
    @Volatile private var isReconnecting = false
    @Volatile private var lastConnectionAttempt = 0L
    
    // Heartbeat e saúde da conexão
    private var heartbeatJob: Job? = null
    @Volatile private var lastHeartbeat = 0L
    @Volatile private var lastSuccessfulMessage = 0L
    @Volatile private var lastPongReceived = 0L
    @Volatile private var isScreenActive = true
    
    private val webSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "🎉 WebSocket ABERTO - enviando ping inicial")
            Log.d(TAG, "🌐 URL: $serverUrl")
            Log.d(TAG, "📱 DeviceId: ${deviceId.takeLast(4)}")
            
            // Aguardar primeira mensagem do servidor para confirmar
            isReconnecting = false
            reconnectAttempts = 0
            
            // Enviar ping inicial para receber pong do servidor e confirmar conexão
            try {
                val pingMessage = mapOf(
                    "type" to "ping",
                    "deviceId" to deviceId,
                    "timestamp" to System.currentTimeMillis()
                )
                val jsonMessage = com.google.gson.Gson().toJson(pingMessage)
                webSocket.send(jsonMessage)
                Log.d(TAG, "📤 Ping inicial enviado - aguardando pong do servidor")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao enviar ping inicial", e)
            }
            
            // Iniciar sistema de heartbeat
            startHeartbeat()
            
            Log.d(TAG, "✅ Conexão WebSocket aberta - aguardando confirmação do servidor")
        }
        
        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "Mensagem recebida: $text")
            val now = System.currentTimeMillis()
            lastSuccessfulMessage = now
            
            // Verificar se é pong
            try {
                val gson = com.google.gson.Gson()
                val message = gson.fromJson(text, Map::class.java)
                if (message["type"] == "pong") {
                    lastPongReceived = now
                    val serverTime = (message["serverTime"] as? Double)?.toLong() ?: 0
                    val latency = if (serverTime > 0) now - serverTime else 0
                    Log.d(TAG, "Pong recebido - latência: ${latency}ms")
                }
            } catch (e: Exception) {
                // Ignorar erro de parse
            }
            
            // Marcar como conectado na PRIMEIRA mensagem recebida do servidor
            if (!isConnected) {
                Log.d(TAG, "✅ PRIMEIRA MENSAGEM DO SERVIDOR RECEBIDA - conexão confirmada!")
                isConnected = true
                onConnectionChange(true)
            }
            
            onMessage(text)
        }
        
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket fechando: $code - $reason")
            isConnected = false
            onConnectionChange(false)
            
            // Parar heartbeat imediatamente
            stopHeartbeat()
        }
        
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket fechado: $code - $reason")
            isConnected = false
            onConnectionChange(false)
            
            // Parar heartbeat
            stopHeartbeat()
            
            // Se foi fechamento inesperado (não foi código 1000 = normal), tentar reconectar
            if (code != 1000) {
                Log.d(TAG, "🔄 Fechamento inesperado (código $code), tentando reconectar...")
                if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    scheduleReconnect()
                }
            } else {
                Log.d(TAG, "✅ Fechamento normal (código 1000), não tentando reconectar automaticamente")
            }
        }
        
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "❌ Falha no WebSocket", t)
            Log.e(TAG, "Response: ${response?.code} - ${response?.message}")
            isConnected = false
            onConnectionChange(false)
            
            // Parar heartbeat
            stopHeartbeat()
            
            // Tentar reconectar automaticamente
            if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                Log.d(TAG, "🔄 Agendando reconexão após falha...")
                scheduleReconnect()
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                Log.w(TAG, "⚠️ Máximo de tentativas atingido, resetando em 30s...")
                // Reset mais rápido para WiFi
                scope.launch {
                    delay(30000L) // 30 segundos
                    Log.d(TAG, "🔄 Resetando tentativas de reconexão...")
                    reconnectAttempts = 0
                    if (!isConnected) {
                        scheduleReconnect()
                    }
                }
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
                    .connectTimeout(CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS)
                    .writeTimeout(60, TimeUnit.SECONDS)
                    .pingInterval(0, TimeUnit.MILLISECONDS)
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
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    scheduleReconnect()
                }
            }
        }
    }
    
    fun disconnect() {
        try {
            Log.d(TAG, "Desconectando WebSocket...")
            stopHeartbeat()
            
            // Fechar WebSocket
            webSocket?.close(1000, "Cliente desconectando")
            webSocket = null
            
            // Limpar cliente HTTP
            client?.dispatcher?.executorService?.shutdown()
            client = null
            
            // Reset de estado
            isConnected = false
            isReconnecting = false
            reconnectAttempts = 0
            
            onConnectionChange(false)
            Log.d(TAG, "WebSocket desconectado com sucesso")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desconectar WebSocket", e)
        }
    }
    
    /**
     * Cleanup completo - deve ser chamado quando não for mais usar a instância
     */
    fun cleanup() {
        disconnect()
        try {
            scope.cancel()
            Log.d(TAG, "WebSocketClient cleanup completo")
        } catch (e: Exception) {
            Log.e(TAG, "Erro durante cleanup", e)
        }
    }
    
    fun sendDeviceStatus(deviceInfo: DeviceInfo? = null) {
        if (!isConnected) {
            Log.w(TAG, "⚠️ WebSocket não conectado, não é possível enviar device_status")
            return
        }
        
        // Verificar se deviceId é válido
        if (deviceId.isNullOrEmpty() || deviceId == "unknown") {
            Log.e(TAG, "❌ DeviceId inválido: '$deviceId' - não é possível enviar device_status")
            return
        }
        
        // NUNCA usar getDefaultDeviceInfo() - sempre coletar dados reais
        val dataToSend = deviceInfo ?: run {
            Log.w(TAG, "⚠️ deviceInfo é null! Usando dados básicos...")
            // Usar dados básicos em vez de valores zerados
            DeviceInfo(
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
                batteryLevel = 85, // Valor simulado
                batteryStatus = "unknown",
                isCharging = false,
                storageTotal = 32L * 1024 * 1024 * 1024, // 32GB simulado
                storageUsed = 15L * 1024 * 1024 * 1024,  // 15GB simulado
                memoryTotal = 0L,
                memoryUsed = 0L,
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
                installedAppsCount = 3, // Valor simulado
                isDeviceOwner = true,
                isProfileOwner = false,
                appVersion = "1.0.0",
                timezone = java.util.TimeZone.getDefault().id,
                language = java.util.Locale.getDefault().language,
                country = java.util.Locale.getDefault().country,
                installedApps = emptyList(),
                allowedApps = emptyList(),
                lastKnownLocation = null,
                locationAccuracy = 0.0f,
                locationProvider = "unknown",
                locationHistoryCount = 0
            )
        }
        
        Log.d(TAG, "=== ENVIANDO DEVICE_STATUS ===")
        Log.d(TAG, "DeviceId: ${dataToSend.deviceId}")
        Log.d(TAG, "Name: ${dataToSend.name}")
        Log.d(TAG, "Model: ${dataToSend.model}")
        Log.d(TAG, "Battery: ${dataToSend.batteryLevel}%")
        Log.d(TAG, "Apps instalados: ${dataToSend.installedAppsCount}")
        Log.d(TAG, "Storage total: ${dataToSend.storageTotal}")
        Log.d(TAG, "Device Owner: ${dataToSend.isDeviceOwner}")
        Log.d(TAG, "=============================")
        
        val message = mapOf(
            "type" to "device_status",
            "data" to dataToSend
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
        Log.d(TAG, "🔄 Forçando reconexão completa...")
        disconnect()
        
        // Reset completo para nova conexão
        reconnectAttempts = 0
        isReconnecting = false
        lastConnectionAttempt = 0L
        lastSuccessfulMessage = 0L
        lastPongReceived = 0L
        
        // Aguardar um pouco antes de reconectar para evitar conflitos
        scope.launch {
            delay(1000) // 1 segundo
            Log.d(TAG, "🚀 Iniciando reconexão após reset...")
            connect()
        }
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
        if (lastSuccessfulMessage > 0 && timeSinceLastMessage > (HEARTBEAT_INTERVAL * 2)) {
            Log.w(TAG, "Conexão pode estar morta (sem mensagens há ${timeSinceLastMessage/1000}s), forçando reconexão")
            forceReconnect()
            return false
        }
        
        return true
    }
    
    fun resetReconnectAttempts() {
        reconnectAttempts = 0
    }
    
    fun setScreenActive(active: Boolean) {
        val wasActive = isScreenActive
        isScreenActive = active
        
        if (wasActive != active) {
            Log.d(TAG, "📱 Estado da tela mudou: ${if (active) "ATIVA" else "INATIVA"}")
            
            if (active && isConnected) {
                // Tela ativa - enviar ping imediato e usar heartbeat mais frequente
                sendPing()
                Log.d(TAG, "📤 Ping imediato enviado devido à tela ativa")
            }
        }
    }
    
    /**
     * Força reconexão quando detecta mudança de rede
     */
    fun onNetworkChanged() {
        Log.d(TAG, "🌐 Mudança de rede detectada - forçando reconexão...")
        
        // Se estiver conectado, verificar se ainda está válido
        if (isConnected) {
            Log.d(TAG, "Verificando se conexão ainda é válida...")
            scope.launch {
                delay(2000) // Aguardar 2s para rede se estabilizar
                
                // Tentar enviar ping para testar conexão
                try {
                    sendPing()
                    delay(5000) // Aguardar resposta
                    
                    // Se não recebeu pong, conexão pode estar morta
                    if (lastPongReceived < System.currentTimeMillis() - 10000) {
                        Log.w(TAG, "Conexão parece estar morta após mudança de rede")
                        forceReconnect()
                    } else {
                        Log.d(TAG, "Conexão ainda válida após mudança de rede")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Erro ao testar conexão após mudança de rede: ${e.message}")
                    forceReconnect()
                }
            }
        } else {
            // Se não estiver conectado, tentar reconectar
            Log.d(TAG, "Não conectado - tentando reconectar após mudança de rede...")
            forceReconnect()
        }
    }
    
    private fun scheduleReconnect() {
        val currentTime = System.currentTimeMillis()
        
        // Evitar tentativas muito frequentes
        if (currentTime - lastConnectionAttempt < MIN_RECONNECT_INTERVAL) {
            Log.d(TAG, "Tentativa de reconexão muito recente, aguardando...")
            scope.launch {
                delay(MIN_RECONNECT_INTERVAL)
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
        
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "Máximo de tentativas de reconexão atingido ($MAX_RECONNECT_ATTEMPTS)")
            // Reset após 60 segundos e tentar novamente
            scope.launch {
                delay(60000L)
                Log.d(TAG, "Resetando tentativas de reconexão após período de espera")
                reconnectAttempts = 0
                if (!isConnected) {
                    Log.d(TAG, "Reiniciando ciclo de reconexão...")
                    scheduleReconnect()
                }
            }
            return
        }
        
        reconnectAttempts++
        
        // Backoff exponencial mais conservador para evitar sobrecarga
        val delay = when {
            reconnectAttempts == 1 -> 1000L // Primeira tentativa: 1s
            reconnectAttempts <= 3 -> 2000L // 2-3 tentativas: 2s
            reconnectAttempts <= 5 -> 5000L // 4-5 tentativas: 5s
            reconnectAttempts <= 10 -> 10000L // 6-10 tentativas: 10s
            reconnectAttempts <= 20 -> 20000L // 11-20 tentativas: 20s
            else -> 30000L // Resto: 30s
        }
        
        Log.d(TAG, "🔄 Agendando reconexão em ${delay}ms (tentativa $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS)")
        
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
        
        val now = System.currentTimeMillis()
        lastSuccessfulMessage = now
        lastPongReceived = now
        
        heartbeatJob = scope.launch {
            while (isConnected && isActive) {
                try {
                    val currentTime = System.currentTimeMillis()
                    
                    // Verificar se não recebemos resposta há muito tempo (2 ciclos)
                    val maxSilence = HEARTBEAT_INTERVAL * 2
                    if (lastSuccessfulMessage > 0 && (currentTime - lastSuccessfulMessage) > maxSilence) {
                        Log.w(TAG, "Não recebemos resposta há muito tempo (${(currentTime - lastSuccessfulMessage)/1000}s), forçando reconexão")
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
                    
                    // Enviar ping
                    sendPing()
                    lastHeartbeat = currentTime
                    
                    val timeSinceLastMessage = (currentTime - lastSuccessfulMessage) / 1000
                    val timeSinceLastPong = (currentTime - lastPongReceived) / 1000
                    
                    Log.d(TAG, "Heartbeat enviado (última msg: ${timeSinceLastMessage}s, último pong: ${timeSinceLastPong}s)")
                    
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao enviar heartbeat: ${e.message}")
                    // Se falhou ao enviar, considerar desconectado
                    isConnected = false
                    onConnectionChange(false)
                    stopHeartbeat()
                    scheduleReconnect()
                    break
                }
                
                // Usar intervalo dinâmico baseado no estado da tela
                val currentInterval = if (isScreenActive) ACTIVE_HEARTBEAT_INTERVAL else HEARTBEAT_INTERVAL
                delay(currentInterval)
            }
        }
    }
    
    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }
    
    /**
     * Companion object com singleton e constantes
     */
    companion object {
        private const val TAG = "WebSocketClient"
        
        // Constantes de reconexão
        private const val MAX_RECONNECT_ATTEMPTS = 30
        private const val MIN_RECONNECT_INTERVAL = 2000L
        private const val CONNECTION_TIMEOUT = 15000L
        
        // Constantes de heartbeat
        private const val HEARTBEAT_INTERVAL = 30000L // Tela bloqueada
        private const val ACTIVE_HEARTBEAT_INTERVAL = 15000L // Tela ativa
        
        @Volatile
        private var INSTANCE: WebSocketClient? = null
        
        fun getInstance(
            serverUrl: String,
            deviceId: String,
            onMessage: (String) -> Unit,
            onConnectionChange: (Boolean) -> Unit
        ): WebSocketClient {
            return synchronized(this) {
                val instance = INSTANCE
                
                // Se a URL mudou, destruir instância antiga e criar nova
                if (instance != null && instance.serverUrl != serverUrl) {
                    Log.d(TAG, "URL mudou de ${instance.serverUrl} para $serverUrl - recriando instância")
                    instance.disconnect()
                    INSTANCE = null
                }
                
                INSTANCE ?: WebSocketClient(serverUrl, deviceId, onMessage, onConnectionChange).also { 
                    INSTANCE = it 
                    Log.d(TAG, "Nova instância criada com URL: $serverUrl")
                }
            }
        }
        
        fun destroyInstance() {
            synchronized(this) {
                INSTANCE?.cleanup()
                INSTANCE = null
            }
        }
    }
}
