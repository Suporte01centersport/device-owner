package com.mdm.launcher.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.mdm.launcher.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.network.WebSocketClient
import com.mdm.launcher.utils.LocationHistoryManager
import kotlinx.coroutines.*
import java.io.IOException
import java.util.*

class LocationService : Service(), LocationListener {
    
    companion object {
        private const val TAG = "LocationService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "location_service_channel"
        private const val LOCATION_UPDATE_INTERVAL = 10000L // 10 segundos - sincronizado com MainActivity
        private const val LOCATION_UPDATE_DISTANCE = 1f // 1 metro - máxima precisão
    }
    
    private lateinit var locationManager: LocationManager
    private var webSocketClient: WebSocketClient? = null
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isLocationUpdatesActive = false
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "LocationService criado")
        createNotificationChannel()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "LocationService iniciado")
        startForeground(NOTIFICATION_ID, createNotification())
        startLocationUpdates()
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "LocationService destruído")
        stopLocationUpdates()
        serviceScope.cancel()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Serviço de Localização",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitora a localização do dispositivo em tempo real"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("📍 Rastreamento Ativo")
            .setContentText("Localização sendo monitorada em tempo real")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
    
    private fun startLocationUpdates() {
        if (isLocationUpdatesActive) return
        
        if (!hasLocationPermissions()) {
            Log.w(TAG, "Permissões de localização não concedidas")
            return
        }
        
        try {
            // Verificar última localização conhecida primeiro
            try {
                val lastKnownGps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                val lastKnownNetwork = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                
                if (lastKnownGps != null) {
                    onLocationChanged(lastKnownGps)
                } else if (lastKnownNetwork != null) {
                    onLocationChanged(lastKnownNetwork)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Erro ao obter última localização: ${e.message}")
            }
            
            // Tentar GPS primeiro (mais preciso)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    LOCATION_UPDATE_INTERVAL,
                    LOCATION_UPDATE_DISTANCE,
                    this
                )
                isLocationUpdatesActive = true
            }
            
            // Também usar Network Provider
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    LOCATION_UPDATE_INTERVAL,
                    LOCATION_UPDATE_DISTANCE,
                    this
                )
            }
            
            if (!isLocationUpdatesActive) {
                Log.e(TAG, "Nenhum provedor de localização disponível")
            } else {
                Log.d(TAG, "Rastreamento de localização iniciado")
            }
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Erro de permissão ao iniciar localização", e)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar localização", e)
        }
    }
    
    private fun stopLocationUpdates() {
        if (!isLocationUpdatesActive) return
        
        try {
            locationManager.removeUpdates(this)
            isLocationUpdatesActive = false
            Log.d(TAG, "Atualizações de localização paradas")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar atualizações de localização", e)
        }
    }
    
    private fun hasLocationPermissions(): Boolean {
        return ActivityCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED && 
        ActivityCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    override fun onLocationChanged(location: Location) {
        serviceScope.launch {
            try {
                val address = getAddressFromLocation(location.latitude, location.longitude)
                LocationHistoryManager.saveLocation(this@LocationService, location, address)
                sendLocationToServer(location, address)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao processar localização", e)
            }
        }
    }
    
    private suspend fun getAddressFromLocation(latitude: Double, longitude: Double): String? {
        return withContext(Dispatchers.IO) {
            try {
                val geocoder = Geocoder(this@LocationService, Locale.getDefault())
                val addresses: List<Address>? = geocoder.getFromLocation(latitude, longitude, 1)
                
                if (!addresses.isNullOrEmpty()) {
                    val address = addresses[0]
                    val addressParts = mutableListOf<String>()
                    
                    address.getAddressLine(0)?.let { addressParts.add(it) }
                    address.locality?.let { addressParts.add(it) }
                    address.adminArea?.let { addressParts.add(it) }
                    address.countryName?.let { addressParts.add(it) }
                    
                    addressParts.joinToString(", ")
                } else {
                    null
                }
            } catch (e: IOException) {
                Log.w(TAG, "Erro ao obter endereço: ${e.message}")
                null
            } catch (e: Exception) {
                Log.w(TAG, "Erro inesperado ao obter endereço: ${e.message}")
                null
            }
        }
    }
    
    private fun sendLocationToServer(location: Location, address: String?) {
        try {
            val deviceId = com.mdm.launcher.utils.DeviceIdManager.getDeviceId(this)
            
            val locationData = mapOf(
                "type" to "location_update",
                "data" to mapOf(
                    "deviceId" to deviceId,
                    "latitude" to location.latitude,
                    "longitude" to location.longitude,
                    "accuracy" to location.accuracy,
                    "provider" to location.provider,
                    "timestamp" to System.currentTimeMillis(),
                    "address" to address
                )
            )
            
            val gson = com.google.gson.Gson()
            val jsonMessage = gson.toJson(locationData)
            
            val intent = Intent("com.mdm.launcher.LOCATION_UPDATE")
            intent.putExtra("location_data", jsonMessage)
            sendBroadcast(intent)
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar localização", e)
        }
    }
    
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
        Log.d(TAG, "Status do provedor $provider mudou para $status")
    }
    
    override fun onProviderEnabled(provider: String) {
        Log.d(TAG, "Provedor $provider habilitado")
    }
    
    override fun onProviderDisabled(provider: String) {
        Log.d(TAG, "Provedor $provider desabilitado")
    }
}
