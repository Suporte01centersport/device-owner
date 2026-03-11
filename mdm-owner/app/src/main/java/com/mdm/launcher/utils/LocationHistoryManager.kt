package com.mdm.launcher.utils

import android.content.Context
import android.location.Location
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.text.SimpleDateFormat
import java.util.*

data class LocationEntry(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val timestamp: Long,
    val provider: String,
    val address: String? = null
)

object LocationHistoryManager {
    private const val TAG = "LocationHistoryManager"
    private const val PREF_NAME = "location_history"
    private const val PENDING_PREF_NAME = "pending_locations"
    private const val MAX_ENTRIES = 1000 // Máximo de 1000 entradas
    private const val MAX_PENDING_ENTRIES = 500 // Máximo de localizações pendentes para envio
    private const val MAX_AGE_DAYS = 30 // Manter apenas 30 dias de histórico
    
    // Distâncias inteligentes baseadas no contexto
    private const val MIN_DISTANCE_METERS = 25f // Distância mínima para salvar (25 metros)
    private const val URBAN_DISTANCE_METERS = 50f // Área urbana (50 metros)
    private const val SUBURBAN_DISTANCE_METERS = 100f // Área suburbana (100 metros)
    private const val RURAL_DISTANCE_METERS = 200f // Área rural (200 metros)
    private const val HIGHWAY_DISTANCE_METERS = 500f // Rodovia (500 metros)
    
    // Thresholds de velocidade para determinar contexto
    private const val WALKING_SPEED_KMH = 8f // < 8 km/h = caminhando
    private const val URBAN_SPEED_KMH = 30f // 8-30 km/h = área urbana
    private const val SUBURBAN_SPEED_KMH = 60f // 30-60 km/h = área suburbana
    private const val HIGHWAY_SPEED_KMH = 80f // > 80 km/h = rodovia
    
    private val gson = Gson()
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    
    // Lock para sincronização de acesso concorrente
    private val lock = Any()
    
    fun saveLocation(context: Context, location: Location, address: String? = null) {
        synchronized(lock) {
            try {
                val history = loadLocationHistory(context)
            val lastLocation = history.maxByOrNull { it.timestamp }
            
            // Verificar se deve salvar baseado na distância inteligente
            if (lastLocation != null) {
                val distance = calculateDistance(
                    lastLocation.latitude, lastLocation.longitude,
                    location.latitude, location.longitude
                )
                
                val requiredDistance = getRequiredDistance(location, lastLocation)
                
                if (distance < requiredDistance) {
                    Log.d(TAG, "Localização não salva - distância insuficiente: ${distance}m < ${requiredDistance}m")
                    return
                }
                
                Log.d(TAG, "✅ Localização salva - distância suficiente: ${distance}m >= ${requiredDistance}m")
            }
            
            val entry = LocationEntry(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy,
                timestamp = System.currentTimeMillis(),
                provider = location.provider ?: "unknown",
                address = address
            )
            
            history.add(entry)
            
            // Manter apenas as entradas mais recentes
            val trimmedHistory = history
                .sortedByDescending { it.timestamp }
                .take(MAX_ENTRIES)
                .filter { 
                    val daysDiff = (System.currentTimeMillis() - it.timestamp) / (1000 * 60 * 60 * 24)
                    daysDiff <= MAX_AGE_DAYS
                }
            
            val json = gson.toJson(trimmedHistory)
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("history", json)
                .apply()
            
                Log.d(TAG, "📍 Localização salva no histórico: ${entry.latitude}, ${entry.longitude} (${history.size} entradas)")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao salvar localização no histórico", e)
            }
        }
    }
    
    fun loadLocationHistory(context: Context): MutableList<LocationEntry> {
        synchronized(lock) {
            return try {
                val json = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                    .getString("history", null)
                
                if (json != null) {
                    val type = object : TypeToken<MutableList<LocationEntry>>() {}.type
                    gson.fromJson(json, type) ?: mutableListOf()
                } else {
                    mutableListOf()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao carregar histórico de localização", e)
                mutableListOf()
            }
        }
    }
    
    fun getRecentLocations(context: Context, hours: Int = 24): List<LocationEntry> {
        val history = loadLocationHistory(context)
        val cutoffTime = System.currentTimeMillis() - (hours * 60 * 60 * 1000)
        
        return history.filter { it.timestamp >= cutoffTime }
            .sortedByDescending { it.timestamp }
    }
    
    fun getLocationStats(context: Context): Map<String, Any> {
        val history = loadLocationHistory(context)
        val now = System.currentTimeMillis()
        val oneDayAgo = now - (24 * 60 * 60 * 1000)
        val oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000)
        
        val recentLocations = history.filter { it.timestamp >= oneDayAgo }
        val weeklyLocations = history.filter { it.timestamp >= oneWeekAgo }
        
        return mapOf(
            "total_entries" to history.size,
            "recent_entries_24h" to recentLocations.size,
            "weekly_entries" to weeklyLocations.size,
            "last_location" to (history.maxByOrNull { it.timestamp } ?: ""),
            "most_used_provider" to (history.groupBy { it.provider }
                .maxByOrNull { it.value.size }?.key ?: "unknown")
        )
    }
    
    fun clearOldEntries(context: Context) {
        synchronized(lock) {
            try {
                val history = loadLocationHistory(context)
                val cutoffTime = System.currentTimeMillis() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
                
                val filteredHistory = history.filter { it.timestamp >= cutoffTime }
                
                val json = gson.toJson(filteredHistory)
                context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString("history", json)
                    .apply()
                
                Log.d(TAG, "Entradas antigas removidas: ${history.size - filteredHistory.size}")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao limpar entradas antigas", e)
            }
        }
    }
    
    fun clearAllHistory(context: Context) {
        synchronized(lock) {
            try {
                context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .remove("history")
                    .apply()
                
                Log.d(TAG, "🗑️ Histórico de localização completamente limpo")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao limpar histórico", e)
            }
        }
    }
    
    /**
     * Força a limpeza completa do histórico e reinicia o sistema inteligente
     */
    fun resetLocationHistory(context: Context) {
        try {
            clearAllHistory(context)
            Log.d(TAG, "🔄 Sistema de histórico de localização reiniciado")
            Log.d(TAG, "📍 Próximas localizações serão salvas com distância inteligente:")
            Log.d(TAG, "   🚶 Caminhando: ${MIN_DISTANCE_METERS}m")
            Log.d(TAG, "   🏙️ Área urbana: ${URBAN_DISTANCE_METERS}m")
            Log.d(TAG, "   🏘️ Área suburbana: ${SUBURBAN_DISTANCE_METERS}m")
            Log.d(TAG, "   🌾 Área rural: ${RURAL_DISTANCE_METERS}m")
            Log.d(TAG, "   🛣️ Rodovia: ${HIGHWAY_DISTANCE_METERS}m")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao resetar histórico", e)
        }
    }
    
    fun formatLocationEntry(entry: LocationEntry): String {
        val date = Date(entry.timestamp)
        val formattedDate = dateFormat.format(date)
        return "📍 ${entry.latitude}, ${entry.longitude} (${entry.accuracy}m) - $formattedDate"
    }
    
    /**
     * Calcula a distância entre dois pontos em metros usando fórmula de Haversine
     */
    private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val results = FloatArray(1)
        Location.distanceBetween(lat1, lon1, lat2, lon2, results)
        return results[0]
    }
    
    // ==================== FILA DE LOCALIZAÇÕES PENDENTES (OFFLINE) ====================

    /**
     * Adiciona uma localização à fila de pendentes para envio quando reconectar
     */
    fun addPendingLocation(context: Context, locationJson: String) {
        synchronized(lock) {
            try {
                val pending = loadPendingLocations(context)
                pending.add(locationJson)

                // Limitar tamanho da fila
                val trimmed = if (pending.size > MAX_PENDING_ENTRIES) {
                    Log.d(TAG, "Fila de pendentes cheia, removendo ${pending.size - MAX_PENDING_ENTRIES} mais antigas")
                    pending.takeLast(MAX_PENDING_ENTRIES).toMutableList()
                } else {
                    pending
                }

                val json = gson.toJson(trimmed)
                context.getSharedPreferences(PENDING_PREF_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString("pending_queue", json)
                    .apply()

                Log.d(TAG, "📦 Localização adicionada à fila offline (${trimmed.size} pendentes)")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao adicionar localização pendente", e)
            }
        }
    }

    /**
     * Retorna e limpa todas as localizações pendentes para envio
     */
    fun drainPendingLocations(context: Context): List<String> {
        synchronized(lock) {
            return try {
                val pending = loadPendingLocations(context)
                if (pending.isEmpty()) return emptyList()

                // Limpar a fila
                context.getSharedPreferences(PENDING_PREF_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .remove("pending_queue")
                    .apply()

                Log.d(TAG, "📤 ${pending.size} localizações pendentes drenadas para envio")
                pending
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao drenar localizações pendentes", e)
                emptyList()
            }
        }
    }

    /**
     * Retorna quantidade de localizações pendentes
     */
    fun getPendingCount(context: Context): Int {
        synchronized(lock) {
            return loadPendingLocations(context).size
        }
    }

    private fun loadPendingLocations(context: Context): MutableList<String> {
        return try {
            val json = context.getSharedPreferences(PENDING_PREF_NAME, Context.MODE_PRIVATE)
                .getString("pending_queue", null)

            if (json != null) {
                val type = object : TypeToken<MutableList<String>>() {}.type
                gson.fromJson(json, type) ?: mutableListOf()
            } else {
                mutableListOf()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar localizações pendentes", e)
            mutableListOf()
        }
    }

    // ==================== FIM FILA PENDENTES ====================

    /**
     * Determina a distância mínima necessária baseada no contexto de movimento
     */
    private fun getRequiredDistance(currentLocation: Location, lastLocation: LocationEntry): Float {
        val timeDiff = (currentLocation.time - lastLocation.timestamp) / 1000f // segundos
        if (timeDiff <= 0) return MIN_DISTANCE_METERS
        
        // Calcular velocidade média em km/h
        val distance = calculateDistance(
            lastLocation.latitude, lastLocation.longitude,
            currentLocation.latitude, currentLocation.longitude
        )
        val speedKmh = (distance / timeDiff) * 3.6f // m/s para km/h
        
        // Determinar distância baseada na velocidade
        return when {
            speedKmh < WALKING_SPEED_KMH -> {
                Log.d(TAG, "🚶 Contexto: Caminhando (${speedKmh} km/h) - Distância: ${MIN_DISTANCE_METERS}m")
                MIN_DISTANCE_METERS
            }
            speedKmh < URBAN_SPEED_KMH -> {
                Log.d(TAG, "🏙️ Contexto: Área urbana (${speedKmh} km/h) - Distância: ${URBAN_DISTANCE_METERS}m")
                URBAN_DISTANCE_METERS
            }
            speedKmh < SUBURBAN_SPEED_KMH -> {
                Log.d(TAG, "🏘️ Contexto: Área suburbana (${speedKmh} km/h) - Distância: ${SUBURBAN_DISTANCE_METERS}m")
                SUBURBAN_DISTANCE_METERS
            }
            speedKmh < HIGHWAY_SPEED_KMH -> {
                Log.d(TAG, "🌾 Contexto: Área rural (${speedKmh} km/h) - Distância: ${RURAL_DISTANCE_METERS}m")
                RURAL_DISTANCE_METERS
            }
            else -> {
                Log.d(TAG, "🛣️ Contexto: Rodovia (${speedKmh} km/h) - Distância: ${HIGHWAY_DISTANCE_METERS}m")
                HIGHWAY_DISTANCE_METERS
            }
        }
    }
}
