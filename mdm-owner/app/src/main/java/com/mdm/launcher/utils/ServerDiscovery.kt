package com.mdm.launcher.utils

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import com.mdm.launcher.BuildConfig
import kotlinx.coroutines.*
import java.net.*

/**
 * Sistema de descoberta automática do servidor MDM
 * 
 * Estratégias (em ordem de prioridade):
 * 0. URL FIXA do BuildConfig (debug: local, release: produção) - PRIORIDADE MÁXIMA
 * 1. Domínio fixo (mdm.local) - ideal para produção
 * 2. Broadcast UDP na rede local - descoberta automática
 * 3. IP configurado manualmente (fallback)
 * 4. IP do emulador (desenvolvimento)
 */
object ServerDiscovery {
    private const val TAG = "ServerDiscovery"
    private const val MDM_DOMAIN = "mdm.local"
    private const val BROADCAST_PORT = 3003
    private const val BROADCAST_MESSAGE = "MDM_DISCOVERY"
    private const val DISCOVERY_TIMEOUT = 5000L // 5 segundos (aumentado para melhor descoberta)
    
    private var lastDiscoveryTime = 0L
    private var cachedServerUrl: String? = null
    private const val DISCOVERY_CACHE_DURATION = 60000L // 1 minuto de cache (aumentado para estabilidade)
    private var consecutiveFailures = 0
    private const val MAX_FAILURES_BEFORE_REDISCOVERY = 2 // Forçar redescoberta após 2 falhas (mais agressivo)
    
    // 🎯 SERVIDORES CONFIGURADOS (fallback para produção)
    private val LINUX_SERVERS = listOf(
        "ws://192.168.2.100:3001",  // Servidor principal Linux
        "ws://192.168.2.74:3001",   // Servidor local Windows PC (debug)
        "ws://192.168.1.100:3001",  // Servidor alternativo Linux
        "ws://10.0.0.100:3001",    // Servidor corporativo Linux
        "ws://172.16.0.100:3001"   // Servidor VPN Linux
    )
    
    // 🔄 CONFIGURAÇÕES DE RESILIÊNCIA
    private const val CONNECTION_TIMEOUT = 3000L // 3 segundos para conexão
    private const val HEALTH_CHECK_INTERVAL = 30000L // 30 segundos entre verificações
    private var lastHealthCheck = 0L
    
    /**
     * Descobre automaticamente o servidor MDM com resiliência máxima
     * @return URL completa do WebSocket (ex: ws://192.168.1.100:3001)
     */
    suspend fun discoverServer(context: Context): String = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        
        // Usar cache se ainda válido (evitar descobertas repetidas)
        if (cachedServerUrl != null && (now - lastDiscoveryTime) < DISCOVERY_CACHE_DURATION) {
            // Verificar saúde do servidor em cache periodicamente
            if ((now - lastHealthCheck) > HEALTH_CHECK_INTERVAL) {
                val serverIp = cachedServerUrl!!.substringAfter("ws://").substringBefore(":")
                if (!isServerResponding(serverIp, 3001)) {
                    invalidateCache()
                } else {
                    lastHealthCheck = now
                }
            }
            
            return@withContext cachedServerUrl!!
        }
        
        // Estratégia 0: URL FIXA do BuildConfig (PRIORIDADE MÁXIMA)
        if (BuildConfig.USE_FIXED_SERVER) {
            val fixedUrl = BuildConfig.SERVER_URL
            
            // No DEBUG, usar sempre a URL fixa, SEM fallbacks
            if (BuildConfig.DEBUG) {
                cachedServerUrl = fixedUrl
                lastDiscoveryTime = now
                lastHealthCheck = now
                saveDiscoveredServerUrl(context, fixedUrl)
                registerConnectionSuccess()
                return@withContext fixedUrl
            }
            
            // No RELEASE, validar se o servidor está respondendo
            val serverIp = fixedUrl.substringAfter("ws://").substringBefore(":")
            if (isServerResponding(serverIp, 3001)) {
                cachedServerUrl = fixedUrl
                lastDiscoveryTime = now
                lastHealthCheck = now
                saveDiscoveredServerUrl(context, fixedUrl)
                registerConnectionSuccess()
                return@withContext fixedUrl
            } else {
                registerConnectionFailure()
            }
        }
        
        // Estratégia 0.5: server_url do add-device (passado via intent - prioridade para dispositivo recém-instalado)
        getManualServerUrl(context)?.let { manualUrl ->
            if (!manualUrl.contains("10.0.2.2")) {
                val serverIp = manualUrl.substringAfter("ws://").substringBefore(":")
                if (isServerResponding(serverIp, 3001)) {
                    cachedServerUrl = manualUrl
                    lastDiscoveryTime = now
                    lastHealthCheck = now
                    saveDiscoveredServerUrl(context, manualUrl)
                    registerConnectionSuccess()
                    return@withContext manualUrl
                }
            }
        }
        
        // Estratégia 1: Tentar domínio fixo (mdm.local)
        tryDomainResolution()?.let { serverUrl ->
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            saveDiscoveredServerUrl(context, serverUrl)
            registerConnectionSuccess()
            return@withContext serverUrl
        }
        
        // Estratégia 2: Descoberta via broadcast UDP
        tryBroadcastDiscovery(context)?.let { serverUrl ->
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            saveDiscoveredServerUrl(context, serverUrl)
            registerConnectionSuccess()
            return@withContext serverUrl
        }
        
        // Estratégia 3: Tentar IPs comuns da rede local
        tryCommonLocalIPs()?.let { serverUrl ->
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            saveDiscoveredServerUrl(context, serverUrl)
            registerConnectionSuccess()
            return@withContext serverUrl
        }
        
        // 🎯 ESTRATÉGIA 4: FALLBACK PARA SERVIDORES LINUX
        if (!BuildConfig.DEBUG) { // Apenas para builds de produção
            tryLinuxServersFallback()?.let { serverUrl ->
                cachedServerUrl = serverUrl
                lastDiscoveryTime = now
                lastHealthCheck = now
                saveDiscoveredServerUrl(context, serverUrl)
                registerConnectionSuccess()
                return@withContext serverUrl
            }
        }
        
        // Estratégia 5: IP configurado manualmente ou descoberto anteriormente
        val manualUrl = getManualServerUrl(context)
        if (manualUrl != null && !manualUrl.contains("10.0.2.2")) {
            cachedServerUrl = manualUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            return@withContext manualUrl
        }
        
        // Fallback final: ERRO
        Log.e(TAG, "Servidor MDM não encontrado após todas as estratégias")
        
        registerConnectionFailure()
        throw Exception("Servidor MDM não encontrado. Verifique se o servidor está rodando e acessível.")
    }
    
    /**
     * Estratégia 1: Resolver via DNS (mdm.local ou domínio customizado)
     */
    private suspend fun tryDomainResolution(): String? = withContext(Dispatchers.IO) {
        try {
            val result = withTimeout(DISCOVERY_TIMEOUT) {
                val address = InetAddress.getByName(MDM_DOMAIN)
                val ip = address.hostAddress ?: return@withTimeout null
                
                if (isServerResponding(ip, 3001)) {
                    "ws://$ip:3001"
                } else {
                    null
                }
            }
            result
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Estratégia 2: Descoberta via broadcast UDP na rede local
     */
    private suspend fun tryBroadcastDiscovery(context: Context): String? = withContext(Dispatchers.IO) {
        var socket: DatagramSocket? = null
        try {
            val broadcastAddress = getBroadcastAddress(context) ?: return@withContext null
            
            socket = DatagramSocket()
            socket.broadcast = true
            socket.soTimeout = DISCOVERY_TIMEOUT.toInt()
            
            val message = BROADCAST_MESSAGE.toByteArray()
            val packet = DatagramPacket(
                message,
                message.size,
                InetAddress.getByName(broadcastAddress),
                BROADCAST_PORT
            )
            
            socket.send(packet)
            
            val buffer = ByteArray(1024)
            val responsePacket = DatagramPacket(buffer, buffer.size)
            
            val serverUrl = withTimeout(DISCOVERY_TIMEOUT) {
                socket.receive(responsePacket)
                val response = String(responsePacket.data, 0, responsePacket.length)
                val serverIp = responsePacket.address.hostAddress
                
                if (response.startsWith("MDM_SERVER")) {
                    val port = response.substringAfter(":").toIntOrNull() ?: 3001
                    "ws://$serverIp:$port"
                } else {
                    null
                }
            }
            
            serverUrl
        } catch (e: Exception) {
            null
        } finally {
            socket?.close()
        }
    }
    
    /**
     * Estratégia 3: Tentar conectar em IPs comuns da rede local
     * Inclui 10.0.2.2 para emulador Android (host do PC quando servidor roda em localhost)
     */
    private suspend fun tryCommonLocalIPs(): String? = withContext(Dispatchers.IO) {
        try {
            val localIp = getLocalIpAddress() ?: return@withContext null

            // Emulador Android: 10.0.2.2 = host (PC onde o servidor localhost roda)
            if (localIp.startsWith("10.0.2.")) {
                if (isServerResponding("10.0.2.2", 3001)) {
                    return@withContext "ws://10.0.2.2:3001"
                }
            }

            val networkPrefix = localIp.substringBeforeLast(".")
            // IPs comuns: gateway(1), roteador(254), PCs(2-100)
            val commonLastOctets = listOf(1, 2, 10, 50, 83, 84, 85, 90, 100, 101, 254)
            
            for (lastOctet in commonLastOctets) {
                val testIp = "$networkPrefix.$lastOctet"
                if (testIp == localIp) continue
                
                if (isServerResponding(testIp, 3001)) {
                    return@withContext "ws://$testIp:3001"
                }
            }
            null
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * 🎯 ESTRATÉGIA 4: Fallback para servidores Linux configurados
     * Tenta conectar em servidores Linux conhecidos quando outras estratégias falham
     */
    private suspend fun tryLinuxServersFallback(): String? = withContext(Dispatchers.IO) {
        try {
            for (serverUrl in LINUX_SERVERS) {
                val serverIp = serverUrl.substringAfter("ws://").substringBefore(":")
                if (isServerResponding(serverIp, 3001)) {
                    return@withContext serverUrl
                }
            }
            null
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Verifica se o servidor está respondendo em um IP e porta
     */
    private fun isServerResponding(ip: String, port: Int): Boolean {
        var socket: Socket? = null
        return try {
            socket = Socket()
            socket.connect(InetSocketAddress(ip, port), CONNECTION_TIMEOUT.toInt()) // Timeout configurável
            socket.isConnected
        } catch (e: Exception) {
            false
        } finally {
            socket?.close()
        }
    }
    
    /**
     * Obtém endereço de broadcast da rede Wi-Fi
     */
    private fun getBroadcastAddress(context: Context): String? {
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val dhcp = wifiManager.dhcpInfo ?: return null
            
            val broadcast = (dhcp.ipAddress and dhcp.netmask) or dhcp.netmask.inv()
            
            return String.format(
                "%d.%d.%d.%d",
                broadcast and 0xff,
                broadcast shr 8 and 0xff,
                broadcast shr 16 and 0xff,
                broadcast shr 24 and 0xff
            )
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao obter broadcast address: ${e.message}")
            return null
        }
    }
    
    /**
     * Obtém IP local do dispositivo
     */
    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                val addresses = networkInterface.inetAddresses
                
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    
                    // Ignorar loopback e IPv6
                    if (!address.isLoopbackAddress && address is Inet4Address) {
                        return address.hostAddress
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao obter IP local: ${e.message}")
        }
        return null
    }
    
    /**
     * Obtém URL configurada manualmente OU descoberta anteriormente
     */
    private fun getManualServerUrl(context: Context): String? {
        return try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            prefs.getString("discovered_server_url", null) ?: prefs.getString("server_url", null)
        } catch (e: Exception) {
            null
        }
    }
    
    fun saveDiscoveredServerUrl(context: Context, serverUrl: String) {
        try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            prefs.edit().putString("discovered_server_url", serverUrl).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar URL: ${e.message}")
        }
    }

    /**
     * Retorna URL do APK usando o servidor ao qual o dispositivo está conectado.
     * Prioridade: servidor conectado (que sabemos que funciona) > URL do painel.
     */
    fun getApkUrlFromConnection(context: Context): String? {
        val wsUrl = cachedServerUrl
            ?: context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE).getString("discovered_server_url", null)
            ?: context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE).getString("server_url", null)
            ?: context.getSharedPreferences("mdm_connection_state", Context.MODE_PRIVATE).getString("last_server_url", null)
            ?: return null
        return try {
            val withoutProtocol = wsUrl.substringAfter("ws://").substringBefore("/")
            val host = withoutProtocol.substringBeforeLast(":")
            val port = withoutProtocol.substringAfterLast(":").takeIf { it.all { c -> c.isDigit() } } ?: "3001"
            "http://$host:$port/apk/mdm.apk"
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao construir URL do APK: ${e.message}")
            null
        }
    }
    
    /**
     * Limpa cache e força nova descoberta
     */
    fun clearCache(context: Context) {
        try {
            cachedServerUrl = null
            lastDiscoveryTime = 0L
            lastHealthCheck = 0L
            consecutiveFailures = 0
            
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            prefs.edit().remove("discovered_server_url").apply()
            prefs.edit().remove("server_url").apply()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar cache: ${e.message}")
        }
    }
    
    fun invalidateCache() {
        cachedServerUrl = null
        lastDiscoveryTime = 0L
        lastHealthCheck = 0L
        consecutiveFailures = 0
    }
    
    fun registerConnectionFailure() {
        consecutiveFailures++
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_REDISCOVERY) {
            invalidateCache()
        }
    }
    
    fun registerConnectionSuccess() {
        consecutiveFailures = 0
    }
    
    /**
     * 🏥 Verifica a saúde do servidor atual
     * @return true se o servidor está respondendo, false caso contrário
     */
    fun checkServerHealth(): Boolean {
        val now = System.currentTimeMillis()
        if ((now - lastHealthCheck) < 10000L) {
            return true
        }
        
        val currentServer = cachedServerUrl ?: return false
        
        try {
            val serverIp = currentServer.substringAfter("ws://").substringBefore(":")
            val isHealthy = isServerResponding(serverIp, 3001)
            lastHealthCheck = now
            
            if (isHealthy) {
                registerConnectionSuccess()
            } else {
                registerConnectionFailure()
            }
            
            return isHealthy
        } catch (e: Exception) {
            registerConnectionFailure()
            return false
        }
    }
    
    suspend fun forceRediscovery(context: Context): String {
        clearCache(context)
        return discoverServer(context)
    }
}


