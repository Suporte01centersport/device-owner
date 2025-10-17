package com.mdm.launcher.utils

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.*
import java.net.*

/**
 * Sistema de descoberta automática do servidor MDM
 * 
 * Estratégias (em ordem de prioridade):
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
    private const val DISCOVERY_TIMEOUT = 3000L // 3 segundos
    
    private var lastDiscoveryTime = 0L
    private var cachedServerUrl: String? = null
    private const val DISCOVERY_CACHE_DURATION = 60000L // 1 minuto de cache
    
    /**
     * Descobre automaticamente o servidor MDM (com cache de 1 minuto)
     * @return URL completa do WebSocket (ex: ws://192.168.1.100:3002)
     */
    suspend fun discoverServer(context: Context): String = withContext(Dispatchers.IO) {
        // Usar cache se ainda válido (evitar descobertas repetidas)
        val now = System.currentTimeMillis()
        if (cachedServerUrl != null && (now - lastDiscoveryTime) < DISCOVERY_CACHE_DURATION) {
            Log.d(TAG, "✓ Usando servidor em cache: $cachedServerUrl (${(now - lastDiscoveryTime)/1000}s atrás)")
            return@withContext cachedServerUrl!!
        }
        
        Log.d(TAG, "=== INICIANDO DESCOBERTA DO SERVIDOR ===")
        
        // Estratégia 1: Tentar domínio fixo (mdm.local)
        tryDomainResolution()?.let { serverUrl ->
            Log.d(TAG, "✓ Servidor encontrado via DNS: $serverUrl")
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            return@withContext serverUrl
        }
        
        // Estratégia 2: Descoberta via broadcast UDP
        tryBroadcastDiscovery(context)?.let { serverUrl ->
            Log.d(TAG, "✓ Servidor encontrado via broadcast: $serverUrl")
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            return@withContext serverUrl
        }
        
        // Estratégia 3: Tentar IPs comuns da rede local
        tryCommonLocalIPs()?.let { serverUrl ->
            Log.d(TAG, "✓ Servidor encontrado via IP comum: $serverUrl")
            cachedServerUrl = serverUrl
            lastDiscoveryTime = now
            return@withContext serverUrl
        }
        
        // Estratégia 4: IP configurado manualmente ou descoberto anteriormente (SharedPreferences)
        val manualUrl = getManualServerUrl(context)
        if (manualUrl != null) {
            if (!manualUrl.contains("10.0.2.2")) {
                Log.d(TAG, "✓ Usando URL salva: $manualUrl")
                return@withContext manualUrl
            }
        }
        
        // Fallback: ERRO - Servidor não encontrado (dispositivos reais não devem usar 10.0.2.2)
        Log.e(TAG, "❌ ERRO: Servidor não encontrado na rede local!")
        Log.e(TAG, "❌ Certifique-se de que:")
        Log.e(TAG, "   1. O servidor está rodando na porta 3002")
        Log.e(TAG, "   2. O dispositivo está na mesma rede WiFi")
        Log.e(TAG, "   3. O firewall não está bloqueando a porta 3002")
        
        // Retornar null para forçar erro visível ao invés de usar IP inválido
        throw Exception("Servidor MDM não encontrado na rede local. Verifique se o servidor está rodando e acessível.")
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
     * Verifica se o servidor está respondendo em um IP e porta
     */
    private fun isServerResponding(ip: String, port: Int): Boolean {
        var socket: Socket? = null
        return try {
            socket = Socket()
            socket.connect(InetSocketAddress(ip, port), 1000) // 1 segundo timeout
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
    }
}

