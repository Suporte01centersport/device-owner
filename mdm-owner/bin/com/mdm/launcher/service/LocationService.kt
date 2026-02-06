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
import com.mdm.launcher.activities.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.utils.LocationHistoryManager
import kotlinx.coroutines.*
import java.io.IOException
import java.util.*

class LocationService : Service(), LocationListener {
    
    companion object {
        private const val TAG = "LocationService"
        private const val NOTIFICATION_ID = 1002
        private const val CHANNEL_ID = "location_service_channel"
        private const val LOCATION_UPDATE_INTERVAL = 60000L // 1 minuto
        private const val LOCATION_UPDATE_DISTANCE = 10f // 10 metros
    }
    
    private lateinit var locationManager: LocationManager
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isLocationUpdatesActive = false
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Verificar permissões antes de iniciar como Foreground Service
        val hasFineLocation = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarseLocation = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        
        if (!hasFineLocation && !hasCoarseLocation) {
            Log.e(TAG, "❌ Cancelando LocationService: permissão de localização não concedida")
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = createNotification()
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            startLocationUpdates()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar startForeground: ${e.message}")
            stopSelf()
        }
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        stopLocationUpdates()
        serviceScope.cancel()
        super.onDestroy()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Serviço de Localização",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitora a localização do dispositivo"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("📍 MDM Launcher")
            .setContentText("Localização ativa")
            .setSmallIcon(R.drawable.ic_service_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
    
    private fun startLocationUpdates() {
        if (isLocationUpdatesActive) return
        
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return
        }
        
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, LOCATION_UPDATE_INTERVAL, LOCATION_UPDATE_DISTANCE, this)
                isLocationUpdatesActive = true
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, LOCATION_UPDATE_INTERVAL, LOCATION_UPDATE_DISTANCE, this)
                isLocationUpdatesActive = true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar localização", e)
        }
    }
    
    private fun stopLocationUpdates() {
        locationManager.removeUpdates(this)
        isLocationUpdatesActive = false
    }
    
    override fun onLocationChanged(location: Location) {
        serviceScope.launch {
            val address = getAddressFromLocation(location.latitude, location.longitude)
            LocationHistoryManager.saveLocation(this@LocationService, location, address)
            checkAllowedArea(location)
        }
    }
    
    private suspend fun getAddressFromLocation(latitude: Double, longitude: Double): String? = withContext(Dispatchers.IO) {
        try {
            val geocoder = Geocoder(this@LocationService, Locale.getDefault())
            val addresses = geocoder.getFromLocation(latitude, longitude, 1)
            if (!addresses.isNullOrEmpty()) {
                val address = addresses[0]
                if (address.maxAddressLineIndex >= 0) {
                    address.getAddressLine(0)
                } else null
            } else null
        } catch (e: Exception) { null }
    }
    
    private fun checkAllowedArea(location: Location) {
        // Implementação simplificada de geofencing
        val prefs = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
        val restrictionsJson = prefs.getString("device_restrictions", null) ?: return
        
        try {
            val restrictions = com.google.gson.Gson().fromJson(restrictionsJson, com.mdm.launcher.data.DeviceRestrictions::class.java)
            val allowed = restrictions.allowedLocation ?: return
            if (allowed.enabled != true) return
            
            val results = FloatArray(1)
            Location.distanceBetween(location.latitude, location.longitude, allowed.latitude, allowed.longitude, results)
            val distanceKm = results[0] / 1000.0
            
            if (distanceKm > allowed.radiusKm) {
                Log.w(TAG, "⚠️ Fora da área permitida: ${String.format("%.2f", distanceKm)} km")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar área", e)
        }
    }
}
