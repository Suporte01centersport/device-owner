package com.mdm.launcher.utils

import android.content.Context
import android.location.Location
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlin.math.*

data class GeofenceZone(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radius: Float, // em metros
    val isActive: Boolean = true,
    val alertOnEnter: Boolean = true,
    val alertOnExit: Boolean = true,
    val created: Long = System.currentTimeMillis()
)

data class GeofenceEvent(
    val zoneId: String,
    val zoneName: String,
    val eventType: String, // "enter" ou "exit"
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val accuracy: Float
)

object GeofenceManager {
    private const val TAG = "GeofenceManager"
    private const val PREF_NAME = "geofence_zones"
    private const val EVENTS_PREF_NAME = "geofence_events"
    private const val MAX_EVENTS = 500
    
    private val gson = Gson()
    
    fun addGeofenceZone(context: Context, zone: GeofenceZone) {
        try {
            val zones = loadGeofenceZones(context).toMutableList()
            zones.removeAll { it.id == zone.id } // Remove se já existir
            zones.add(zone)
            
            val json = gson.toJson(zones)
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("zones", json)
                .apply()
            
            Log.d(TAG, "Zona de geofencing adicionada: ${zone.name}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao adicionar zona de geofencing", e)
        }
    }
    
    fun removeGeofenceZone(context: Context, zoneId: String) {
        try {
            val zones = loadGeofenceZones(context).toMutableList()
            zones.removeAll { it.id == zoneId }
            
            val json = gson.toJson(zones)
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("zones", json)
                .apply()
            
            Log.d(TAG, "Zona de geofencing removida: $zoneId")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao remover zona de geofencing", e)
        }
    }
    
    fun loadGeofenceZones(context: Context): List<GeofenceZone> {
        return try {
            val json = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .getString("zones", null)
            
            if (json != null) {
                val type = object : TypeToken<List<GeofenceZone>>() {}.type
                gson.fromJson(json, type) ?: emptyList()
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar zonas de geofencing", e)
            emptyList()
        }
    }
    
    fun checkGeofenceEvents(context: Context, currentLocation: Location): List<GeofenceEvent> {
        val zones = loadGeofenceZones(context).filter { it.isActive }
        val events = mutableListOf<GeofenceEvent>()
        
        for (zone in zones) {
            val distance = calculateDistance(
                currentLocation.latitude, currentLocation.longitude,
                zone.latitude, zone.longitude
            )
            
            val isInside = distance <= zone.radius
            val wasInside = wasInsideZone(context, zone.id)
            
            if (isInside && !wasInside && zone.alertOnEnter) {
                // Entrou na zona
                val event = GeofenceEvent(
                    zoneId = zone.id,
                    zoneName = zone.name,
                    eventType = "enter",
                    latitude = currentLocation.latitude,
                    longitude = currentLocation.longitude,
                    timestamp = System.currentTimeMillis(),
                    accuracy = currentLocation.accuracy
                )
                events.add(event)
                saveGeofenceEvent(context, event)
                setZoneStatus(context, zone.id, true)
                Log.d(TAG, "Entrou na zona: ${zone.name}")
            } else if (!isInside && wasInside && zone.alertOnExit) {
                // Saiu da zona
                val event = GeofenceEvent(
                    zoneId = zone.id,
                    zoneName = zone.name,
                    eventType = "exit",
                    latitude = currentLocation.latitude,
                    longitude = currentLocation.longitude,
                    timestamp = System.currentTimeMillis(),
                    accuracy = currentLocation.accuracy
                )
                events.add(event)
                saveGeofenceEvent(context, event)
                setZoneStatus(context, zone.id, false)
                Log.d(TAG, "Saiu da zona: ${zone.name}")
            }
        }
        
        return events
    }
    
    private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val results = FloatArray(1)
        Location.distanceBetween(lat1, lon1, lat2, lon2, results)
        return results[0]
    }
    
    private fun wasInsideZone(context: Context, zoneId: String): Boolean {
        return context.getSharedPreferences("zone_status", Context.MODE_PRIVATE)
            .getBoolean(zoneId, false)
    }
    
    private fun setZoneStatus(context: Context, zoneId: String, isInside: Boolean) {
        context.getSharedPreferences("zone_status", Context.MODE_PRIVATE)
            .edit()
            .putBoolean(zoneId, isInside)
            .apply()
    }
    
    private fun saveGeofenceEvent(context: Context, event: GeofenceEvent) {
        try {
            val events = loadGeofenceEvents(context).toMutableList()
            events.add(event)
            
            // Manter apenas os eventos mais recentes
            val trimmedEvents = events
                .sortedByDescending { it.timestamp }
                .take(MAX_EVENTS)
            
            val json = gson.toJson(trimmedEvents)
            context.getSharedPreferences(EVENTS_PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("events", json)
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar evento de geofencing", e)
        }
    }
    
    fun loadGeofenceEvents(context: Context): List<GeofenceEvent> {
        return try {
            val json = context.getSharedPreferences(EVENTS_PREF_NAME, Context.MODE_PRIVATE)
                .getString("events", null)
            
            if (json != null) {
                val type = object : TypeToken<List<GeofenceEvent>>() {}.type
                gson.fromJson(json, type) ?: emptyList()
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar eventos de geofencing", e)
            emptyList()
        }
    }
    
    fun getRecentGeofenceEvents(context: Context, hours: Int = 24): List<GeofenceEvent> {
        val events = loadGeofenceEvents(context)
        val cutoffTime = System.currentTimeMillis() - (hours * 60 * 60 * 1000)
        
        return events.filter { it.timestamp >= cutoffTime }
            .sortedByDescending { it.timestamp }
    }
    
    fun clearGeofenceEvents(context: Context) {
        try {
            context.getSharedPreferences(EVENTS_PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove("events")
                .apply()
            
            Log.d(TAG, "Eventos de geofencing limpos")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar eventos de geofencing", e)
        }
    }
}
