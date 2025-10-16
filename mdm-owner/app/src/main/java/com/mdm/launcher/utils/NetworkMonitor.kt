package com.mdm.launcher.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Monitor de rede para detectar mudanças de conectividade
 * e notificar sobre disponibilidade de internet
 */
class NetworkMonitor(private val context: Context) {
    
    companion object {
        private const val TAG = "NetworkMonitor"
        private const val NOTIFICATION_DEBOUNCE_MS = 5000L // 5 segundos entre notificações
    }
    
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()
    
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var isMonitoring = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Callback para quando a conectividade muda
    private var onConnectivityChange: ((Boolean) -> Unit)? = null
    
    // Debouncing para evitar notificações excessivas
    private var lastNotificationTime = 0L
    private var lastConnectedState: Boolean? = null
    
    init {
        Log.d(TAG, "NetworkMonitor inicializado")
        checkInitialConnectivity()
    }
    
    private fun checkInitialConnectivity() {
        val isConnected = isNetworkAvailable()
        _isConnected.value = isConnected
        Log.d(TAG, "Conectividade inicial: $isConnected")
    }
    
    fun startMonitoring(onConnectivityChange: (Boolean) -> Unit) {
        this.onConnectivityChange = onConnectivityChange
        if (isMonitoring) {
            Log.d(TAG, "Monitoramento já ativo")
            return
        }
        
        Log.d(TAG, "🚀 Iniciando monitoramento de rede...")
        isMonitoring = true
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Android 7+ - usar registerDefaultNetworkCallback
            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.d(TAG, "🌐 Rede disponível: ${network}")
                    scope.launch {
                        delay(1000) // Aguardar estabilização
                        val connected = isNetworkAvailable()
                        _isConnected.value = connected
                        onConnectivityChange(connected)
                        Log.d(TAG, "✅ Conectividade confirmada: $connected")
                    }
                }
                
                override fun onLost(network: Network) {
                    Log.d(TAG, "❌ Rede perdida: ${network}")
                    scope.launch {
                        delay(500) // Aguardar um pouco para confirmar
                        val connected = isNetworkAvailable()
                        _isConnected.value = connected
                        onConnectivityChange(connected)
                        Log.d(TAG, "❌ Conectividade perdida: $connected")
                    }
                }
                
                override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                    val hasInternet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    val isValidated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    val connected = hasInternet && isValidated
                    
                    // Debounce: só notificar se mudou E passou tempo suficiente
                    val now = System.currentTimeMillis()
                    if (connected != lastConnectedState && (now - lastNotificationTime) > NOTIFICATION_DEBOUNCE_MS) {
                        Log.d(TAG, "🔄 Mudança real de capacidades: internet=$hasInternet, validado=$isValidated")
                        lastConnectedState = connected
                        lastNotificationTime = now
                        
                        scope.launch {
                            delay(500)
                            _isConnected.value = connected
                            onConnectivityChange?.invoke(connected)
                            Log.d(TAG, "✅ Notificação de conectividade enviada: $connected")
                        }
                    }
                }
            }
            
            try {
                connectivityManager.registerDefaultNetworkCallback(networkCallback!!)
                Log.d(TAG, "✅ Callback de rede registrado (Android 7+)")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao registrar callback de rede", e)
                fallbackToLegacyMonitoring()
            }
        } else {
            fallbackToLegacyMonitoring()
        }
    }
    
    private fun fallbackToLegacyMonitoring() {
        Log.d(TAG, "Usando monitoramento legacy (Android < 7)")
        
        // Monitoramento por polling para versões antigas
        scope.launch {
            while (isMonitoring) {
                val wasConnected = _isConnected.value
                val isConnected = isNetworkAvailable()
                
                if (wasConnected != isConnected) {
                    _isConnected.value = isConnected
                    onConnectivityChange?.invoke(isConnected)
                    Log.d(TAG, "🔄 Conectividade alterada: $isConnected")
                }
                
                delay(5000) // Verificar a cada 5 segundos
            }
        }
    }
    
    fun stopMonitoring() {
        Log.d(TAG, "🛑 Parando monitoramento de rede...")
        isMonitoring = false
        onConnectivityChange = null
        
        networkCallback?.let { callback ->
            try {
                connectivityManager.unregisterNetworkCallback(callback)
                Log.d(TAG, "✅ Callback de rede desregistrado")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao desregistrar callback de rede", e)
            }
        }
        networkCallback = null
    }
    
    private fun isNetworkAvailable(): Boolean {
        return try {
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
                networkCapabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
                networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            } else {
                @Suppress("DEPRECATION")
                val networkInfo = connectivityManager.getNetworkInfo(activeNetwork)
                networkInfo?.isConnectedOrConnecting == true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar conectividade", e)
            false
        }
    }
    
    fun getNetworkInfo(): String {
        return try {
            val activeNetwork = connectivityManager.activeNetwork
            val networkCapabilities = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                connectivityManager.getNetworkCapabilities(activeNetwork)
            } else null
            
            val info = StringBuilder()
            info.append("Conectado: ${_isConnected.value}\n")
            
            if (networkCapabilities != null) {
                info.append("WiFi: ${networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)}\n")
                info.append("Cellular: ${networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)}\n")
                info.append("Internet: ${networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)}\n")
                info.append("Validado: ${networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)}")
            }
            
            info.toString()
        } catch (e: Exception) {
            "Erro ao obter info da rede: ${e.message}"
        }
    }
    
    fun destroy() {
        stopMonitoring()
        scope.cancel()
        Log.d(TAG, "NetworkMonitor destruído")
    }
}
