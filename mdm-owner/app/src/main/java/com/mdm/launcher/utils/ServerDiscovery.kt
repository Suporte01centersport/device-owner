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
    
    // 🎯 SERVIDORES LINUX CONFIGURADOS (fallback para produção)
    private val LINUX_SERVERS = listOf(
        "ws://192.168.2.100:3002",  // Servidor principal Linux
        "ws://192.168.1.100:3002",  // Servidor alternativo Linux
        "ws://10.0.0.100:3002",    // Servidor corporativo Linux
        "ws://172.16.0.100:3002"   // Servidor VPN Linux
    )
    
    // 🔄 CONFIGURAÇÕES DE RESILIÊNCIA
    private const val CONNECTION_TIMEOUT = 3000L // 3 segundos para conexão
    private const val HEALTH_CHECK_INTERVAL = 30000L // 30 segundos entre verificações
    private var lastHealthCheck = 0L
    
    /**
     * Descobre automaticamente o servidor MDM com resiliência máxima
     * @return URL completa do WebSocket (ex: ws://192.168.1.100:3002)
     */
    suspend fun discoverServer(context: Context): String = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        
        // Usar cache se ainda válido (evitar descobertas repetidas)
        if (cachedServerUrl != null && (now - lastDiscoveryTime) < DISCOVERY_CACHE_DURATION) {
            Log.d(TAG, "✓ Usando servidor em cache: $cachedServerUrl (${(now - lastDiscoveryTime)/1000}s atrás)")
            
            // Verificar saúde do servidor em cache periodicamente
            if ((now - lastHealthCheck) > HEALTH_CHECK_INTERVAL) {
                val serverIp = cachedServerUrl!!.substringAfter("ws://").substringBefore(":")
                if (!isServerResponding(serverIp, 3002)) {
                    Log.w(TAG, "⚠️ Servidor em cache não está respondendo - invalidando cache")
                    invalidateCache()
                } else {
                    lastHealthCheck = now
                }
            }
            
            return@withContext cachedServerUrl!!
        }
        
        Log.d(TAG, "=== INICIANDO DESCOBERTA DO SERVIDOR ===")
        Log.d(TAG, "Build Type: ${if (BuildConfig.DEBUG) "DEBUG" else "RELEASE"}")
        
        // Estratégia 0: URL FIXA do BuildConfig (PRIORIDADE MÁXIMA)
        if (BuildConfig.USE_FIXED_SERVER) {
            val fixedUrl = BuildConfig.SERVER_URL
            Log.d(TAG, "🎯 Usando URL FIXA do BuildConfig (${if (BuildConfig.DEBUG) "DEBUG" else "RELEASE"}): $fixedUrl")
            
            // Validar se o servidor está respondendo
            val serverIp = fixedUrl.substringAfter("ws://").substringBefore(":")
            if (isServerResponding(serverIp, 3002)) {
                Log.d(TAG, "✅ Servidor FIXO respondendo: $fixedUrl")
                cachedServerUrl = fixedUrl
                lastDiscoveryTime = now
                lastHealthCheck = now
                saveDiscoveredServerUrl(context, fixedUrl)
                registerConnectionSuccess()
                return@withContext fixedUrl
            } else {
                Log.w(TAG, "⚠️ Servidor FIXO não está respondendo, tentando fallbacks...")
                registerConnectionFailure()
            }
        }
        
        // Estratégia 1: Tentar domínio fixo (mdm.local)
        tryDomainResolution()?.let { serverUrl ->
            Log.d(TAG, "✓ Servidor encontrado via DNS: $serverUrl")
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            saveDiscoveredServerUrl(context, serverUrl)
            registerConnectionSuccess()
            return@withContext serverUrl
        }
        
        // Estratégia 2: Descoberta via broadcast UDP
        tryBroadcastDiscovery(context)?.let { serverUrl ->
            Log.d(TAG, "✓ Servidor encontrado via broadcast: $serverUrl")
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            saveDiscoveredServerUrl(context, serverUrl)
            registerConnectionSuccess()
            return@withContext serverUrl
        }
        
        // Estratégia 3: Tentar IPs comuns da rede local
        tryCommonLocalIPs()?.let { serverUrl ->
            Log.d(TAG, "✓ Servidor encontrado via IP comum: $serverUrl")
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            saveDiscoveredServerUrl(context, serverUrl)
            registerConnectionSuccess()
            return@withContext serverUrl
        }
        
        // 🎯 ESTRATÉGIA 4: FALLBACK PARA SERVIDORES LINUX (NOVO!)
        if (!BuildConfig.DEBUG) { // Apenas para builds de produção
            Log.d(TAG, "🔄 Tentando servidores Linux configurados como fallback...")
            tryLinuxServersFallback()?.let { serverUrl ->
                Log.d(TAG, "✅ Servidor Linux encontrado: $serverUrl")
                cachedServerUrl = serverUrl
                lastDiscoveryTime = now
                lastHealthCheck = now
                saveDiscoveredServerUrl(context, serverUrl)
                registerConnectionSuccess()
                return@withContext serverUrl
            }
        }
        
        // Estratégia 5: IP configurado manualmente ou descoberto anteriormente (SharedPreferences)
        val manualUrl = getManualServerUrl(context)
        if (manualUrl != null && !manualUrl.contains("10.0.2.2")) {
            Log.d(TAG, "✓ Usando URL salva: $manualUrl")
            cachedServerUrl = manualUrl
            lastDiscoveryTime = now
            lastHealthCheck = now
            return@withContext manualUrl
        }
        
        // Fallback final: ERRO - Servidor não encontrado
        Log.e(TAG, "❌ ERRO: Servidor não encontrado após todas as estratégias!")
        Log.e(TAG, "❌ Estratégias tentadas:")
        Log.e(TAG, "   - URL fixa do BuildConfig")
        Log.e(TAG, "   - Resolução DNS (mdm.local)")
        Log.e(TAG, "   - Broadcast UDP")
        Log.e(TAG, "   - IPs comuns da rede local")
        if (!BuildConfig.DEBUG) {
            Log.e(TAG, "   - Servidores Linux configurados")
        }
        Log.e(TAG, "   - URLs salvas anteriormente")
        
        registerConnectionFailure()
        throw Exception("Servidor MDM não encontrado. Verifique se o servidor está rodando e acessível.")
    }
    
    /**
     * Estratégia 1: Resolver via DNS (mdm.local ou domínio customizado)
     */
    private suspend fun tryDomainResolution(): String? = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Tentando resolver domínio: $MDM_DOMAIN")
            
            val result = withTimeout(DISCOVERY_TIMEOUT) {
                val address = InetAddress.getByName(MDM_DOMAIN)
                val ip = address.hostAddress ?: return@withTimeout null
                Log.d(TAG, "Domínio $MDM_DOMAIN resolvido para: $ip")
                
                // Verificar se o servidor está respondendo
                if (isServerResponding(ip, 3002)) {
                    "ws://$ip:3002"
                } else {
                    null
                }
            }
            
            result
        } catch (e: UnknownHostException) {
            Log.d(TAG, "Domínio $MDM_DOMAIN não encontrado (normal se não configurado)")
            null
        } catch (e: TimeoutCancellationException) {
            Log.d(TAG, "Timeout ao resolver domínio")
            null
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao resolver domínio: ${e.message}")
            null
        }
    }
    
    /**
     * Estratégia 2: Descoberta via broadcast UDP na rede local
     */
    private suspend fun tryBroadcastDiscovery(context: Context): String? = withContext(Dispatchers.IO) {
        var socket: DatagramSocket? = null
        try {
            Log.d(TAG, "Iniciando descoberta via broadcast UDP...")
            
            // Obter endereço de broadcast da rede Wi-Fi
            val broadcastAddress = getBroadcastAddress(context)
            if (broadcastAddress == null) {
                Log.d(TAG, "Não foi possível obter endereço de broadcast (Wi-Fi desconectado?)")
                return@withContext null
            }
            
            Log.d(TAG, "Endereço de broadcast: $broadcastAddress")
            
            socket = DatagramSocket()
            socket.broadcast = true
            socket.soTimeout = DISCOVERY_TIMEOUT.toInt()
            
            // Enviar mensagem de descoberta
            val message = BROADCAST_MESSAGE.toByteArray()
            val packet = DatagramPacket(
                message,
                message.size,
                InetAddress.getByName(broadcastAddress),
                BROADCAST_PORT
            )
            
            Log.d(TAG, "Enviando broadcast: $BROADCAST_MESSAGE para $broadcastAddress:$BROADCAST_PORT")
            socket.send(packet)
            
            // Aguardar resposta
            val buffer = ByteArray(1024)
            val responsePacket = DatagramPacket(buffer, buffer.size)
            
            val serverUrl = withTimeout(DISCOVERY_TIMEOUT) {
                socket.receive(responsePacket)
                val response = String(responsePacket.data, 0, responsePacket.length)
                val serverIp = responsePacket.address.hostAddress
                
                Log.d(TAG, "Resposta recebida de $serverIp: $response")
                
                // Validar resposta
                if (response.startsWith("MDM_SERVER")) {
                    val port = response.substringAfter(":").toIntOrNull() ?: 3002
                    "ws://$serverIp:$port"
                } else {
                    null
                }
            }
            
            serverUrl
        } catch (e: SocketTimeoutException) {
            Log.d(TAG, "Timeout no broadcast discovery (servidor não respondeu)")
            null
        } catch (e: TimeoutCancellationException) {
            Log.d(TAG, "Timeout no broadcast discovery")
            null
        } catch (e: Exception) {
            Log.w(TAG, "Erro no broadcast discovery: ${e.message}")
            null
        } finally {
            socket?.close()
        }
    }
    
    /**
     * Estratégia 3: Tentar conectar em IPs comuns da rede local
     */
    private suspend fun tryCommonLocalIPs(): String? = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Tentando IPs comuns da rede local...")
            
            // Obter IP local do dispositivo para deduzir a rede
            val localIp = getLocalIpAddress()
            if (localIp == null) {
                Log.d(TAG, "Não foi possível obter IP local")
                return@withContext null
            }
            
            Log.d(TAG, "IP local do dispositivo: $localIp")
            
            // Extrair prefixo da rede (ex: 192.168.1.xxx -> 192.168.1)
            val networkPrefix = localIp.substringBeforeLast(".")
            
            // IPs comuns para testar (gateway, .1, .100, .10, etc)
            val commonLastOctets = listOf(1, 100, 10, 2, 50, 254)
            
            for (lastOctet in commonLastOctets) {
                val testIp = "$networkPrefix.$lastOctet"
                
                // Pular o próprio IP do dispositivo
                if (testIp == localIp) continue
                
                Log.d(TAG, "Testando IP: $testIp")
                
                if (isServerResponding(testIp, 3002)) {
                    Log.d(TAG, "✓ Servidor encontrado em: $testIp")
                    return@withContext "ws://$testIp:3002"
                }
            }
            
            Log.d(TAG, "Nenhum servidor encontrado nos IPs comuns")
            null
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao testar IPs comuns: ${e.message}")
            null
        }
    }
    
    /**
     * 🎯 ESTRATÉGIA 4: Fallback para servidores Linux configurados
     * Tenta conectar em servidores Linux conhecidos quando outras estratégias falham
     */
    private suspend fun tryLinuxServersFallback(): String? = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "🔄 Tentando servidores Linux configurados...")
            
            for (serverUrl in LINUX_SERVERS) {
                val serverIp = serverUrl.substringAfter("ws://").substringBefore(":")
                Log.d(TAG, "🔍 Testando servidor Linux: $serverIp")
                
                if (isServerResponding(serverIp, 3002)) {
                    Log.d(TAG, "✅ Servidor Linux respondendo: $serverUrl")
                    return@withContext serverUrl
                } else {
                    Log.d(TAG, "❌ Servidor Linux não responde: $serverIp")
                }
            }
            
            Log.d(TAG, "❌ Nenhum servidor Linux configurado está respondendo")
            null
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao testar servidores Linux: ${e.message}")
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
            // Primeiro tentar URL descoberta automaticamente
            val discoveredUrl = prefs.getString("discovered_server_url", null)
            if (!discoveredUrl.isNullOrEmpty()) {
                Log.d(TAG, "✓ Usando URL descoberta anteriormente: $discoveredUrl")
                return discoveredUrl
            }
            // Depois tentar URL manual
            prefs.getString("server_url", null)
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Salva URL descoberta para uso futuro
     */
    fun saveDiscoveredServerUrl(context: Context, serverUrl: String) {
        try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            prefs.edit().putString("discovered_server_url", serverUrl).apply()
            Log.d(TAG, "URL descoberta salva: $serverUrl")
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao salvar URL descoberta: ${e.message}")
        }
    }
    
    /**
     * Limpa cache e força nova descoberta
     */
    fun clearCache(context: Context) {
        try {
            Log.d(TAG, "🧹 Limpando cache de descoberta...")
            
            // Limpar cache em memória
            cachedServerUrl = null
            lastDiscoveryTime = 0L
            lastHealthCheck = 0L
            consecutiveFailures = 0
            
            // Limpar SharedPreferences
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            prefs.edit().remove("discovered_server_url").apply()
            prefs.edit().remove("server_url").apply()
            
            Log.d(TAG, "✅ Cache limpo com sucesso - próxima descoberta será forçada")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao limpar cache: ${e.message}")
        }
    }
    
    /**
     * Invalida cache forçando nova descoberta na próxima vez
     */
    fun invalidateCache() {
        Log.d(TAG, "♻️ Invalidando cache de descoberta...")
        cachedServerUrl = null
        lastDiscoveryTime = 0L
        lastHealthCheck = 0L
        consecutiveFailures = 0
    }
    
    /**
     * Registra falha de conexão - após múltiplas falhas, invalida cache automaticamente
     */
    fun registerConnectionFailure() {
        consecutiveFailures++
        Log.w(TAG, "⚠️ Falha de conexão registrada ($consecutiveFailures/$MAX_FAILURES_BEFORE_REDISCOVERY)")
        
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_REDISCOVERY) {
            Log.w(TAG, "🔄 Muitas falhas consecutivas - invalidando cache e forçando redescoberta")
            invalidateCache()
        }
    }
    
    /**
     * Reseta contador de falhas quando conecta com sucesso
     */
    fun registerConnectionSuccess() {
        if (consecutiveFailures > 0) {
            Log.d(TAG, "✅ Conexão bem-sucedida - resetando contador de falhas")
            consecutiveFailures = 0
        }
    }
    
    /**
     * 🏥 Verifica a saúde do servidor atual
     * @return true se o servidor está respondendo, false caso contrário
     */
    fun checkServerHealth(): Boolean {
        val now = System.currentTimeMillis()
        
        // Evitar verificações muito frequentes
        if ((now - lastHealthCheck) < 10000L) { // Mínimo 10 segundos entre verificações
            return true // Assumir saudável se verificou recentemente
        }
        
        val currentServer = cachedServerUrl
        if (currentServer == null) {
            Log.d(TAG, "🏥 Nenhum servidor em cache para verificar saúde")
            return false
        }
        
        try {
            val serverIp = currentServer.substringAfter("ws://").substringBefore(":")
            val isHealthy = isServerResponding(serverIp, 3002)
            
            lastHealthCheck = now
            
            if (isHealthy) {
                Log.d(TAG, "✅ Servidor saudável: $serverIp")
                registerConnectionSuccess()
            } else {
                Log.w(TAG, "⚠️ Servidor não saudável: $serverIp")
                registerConnectionFailure()
            }
            
            return isHealthy
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao verificar saúde do servidor: ${e.message}")
            registerConnectionFailure()
            return false
        }
    }
    
    /**
     * 🔄 Força redescoberta completa do servidor
     * Útil quando há problemas de conectividade
     */
    suspend fun forceRediscovery(context: Context): String {
        Log.d(TAG, "🔄 FORÇANDO REDESCOBERTA COMPLETA DO SERVIDOR")
        
        // Limpar todo cache
        clearCache(context)
        
        // Tentar descobrir novamente
        return discoverServer(context)
    }
}


