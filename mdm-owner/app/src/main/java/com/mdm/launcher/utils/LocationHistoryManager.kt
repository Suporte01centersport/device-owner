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
    private const val MAX_ENTRIES = 1000 // Máximo de 1000 entradas
    private const val MAX_AGE_DAYS = 30 // Manter apenas 30 dias de histórico
    
    private val gson = Gson()
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    
    fun saveLocation(context: Context, location: Location, address: String? = null) {
        try {
            val entry = LocationEntry(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy,
                timestamp = System.currentTimeMillis(),
                provider = location.provider ?: "unknown",
                address = address
            )
            
            val history = loadLocationHistory(context)
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
            
            Log.d(TAG, "Localização salva no histórico: ${entry.latitude}, ${entry.longitude}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar localização no histórico", e)
        }
    }
    
    fun loadLocationHistory(context: Context): MutableList<LocationEntry> {
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
    
    fun clearAllHistory(context: Context) {
        try {
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove("history")
                .apply()
            
            Log.d(TAG, "Histórico de localização limpo")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar histórico", e)
        }
    }
    
    fun formatLocationEntry(entry: LocationEntry): String {
        val date = Date(entry.timestamp)
        val formattedDate = dateFormat.format(date)
        return "📍 ${entry.latitude}, ${entry.longitude} (${entry.accuracy}m) - $formattedDate"
    }
}
