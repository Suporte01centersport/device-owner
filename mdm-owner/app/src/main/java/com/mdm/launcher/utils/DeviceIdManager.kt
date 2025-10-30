package com.mdm.launcher.utils

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Log
import java.util.UUID

/**
 * Gerenciador de DeviceId persistente
 * Garante que o mesmo deviceId seja usado mesmo após reinstalação do app
 */
object DeviceIdManager {
    
    private const val TAG = "DeviceIdManager"
    private const val PREF_NAME = "mdm_device_identity"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_DEVICE_ID_SOURCE = "device_id_source"
    
    /**
     * Obtém o deviceId persistente do dispositivo
     * Prioridade:
     * 1. DeviceId já salvo em SharedPreferences (sobrevive reinstalação se backup estiver ativo)
     * 2. ANDROID_ID do sistema (único por app após Android 8.0)
     * 3. ID gerado baseado em características únicas do hardware
     * 4. UUID aleatório salvo localmente (último recurso)
     */
    fun getDeviceId(context: Context): String {
        val prefs = getPreferences(context)
        
        // 1. Verificar se já existe um deviceId salvo
        val savedDeviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (!savedDeviceId.isNullOrEmpty() && savedDeviceId != "unknown" && savedDeviceId != "unknown-device") {
            return savedDeviceId
        }
        
        // 2. Tentar obter ANDROID_ID
        val androidId = try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao obter ANDROID_ID: ${e.message}")
            null
        }
        
        if (!androidId.isNullOrEmpty() && 
            androidId != "9774d56d682e549c" && // ANDROID_ID padrão de emuladores Android 2.2
            androidId.length >= 8) {
            saveDeviceId(context, androidId, "ANDROID_ID")
            return androidId
        }
        
        // 3. Gerar ID baseado em características únicas do hardware
        val hardwareId = generateHardwareBasedId()
        if (hardwareId != null) {
            saveDeviceId(context, hardwareId, "HARDWARE")
            return hardwareId
        }
        
        // 4. Último recurso: gerar UUID aleatório
        val uuid = UUID.randomUUID().toString().replace("-", "")
        saveDeviceId(context, uuid, "UUID")
        return uuid
    }
    
    /**
     * Gera um ID único baseado em características imutáveis do hardware
     * Retorna null se não conseguir gerar um ID confiável
     */
    private fun generateHardwareBasedId(): String? {
        return try {
            // Usar características que não mudam com factory reset ou reinstalação
            val serialNumber = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    Build.getSerial()
                } catch (e: SecurityException) {
                    Build.SERIAL
                }
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
            
            // Se conseguiu obter o número de série e não é "unknown"
            if (!serialNumber.isNullOrEmpty() && 
                serialNumber != "unknown" && 
                serialNumber != "UNKNOWN" &&
                serialNumber.length >= 6) {
                
                // Combinar com outras características para maior unicidade
                val combined = "${serialNumber}_${Build.BOARD}_${Build.BRAND}_${Build.DEVICE}"
                
                // Usar SHA-256 para gerar hash estável (não usar hashCode!)
                val bytes = combined.toByteArray()
                val md = java.security.MessageDigest.getInstance("SHA-256")
                val digest = md.digest(bytes)
                
                // Converter para hex string
                val hexString = digest.joinToString("") { "%02x".format(it) }
                
                return hexString.substring(0, 32) // Primeiros 32 caracteres
            }
            null
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao gerar ID baseado em hardware: ${e.message}", e)
            null
        }
    }
    
    /**
     * Salva o deviceId em SharedPreferences
     */
    private fun saveDeviceId(context: Context, deviceId: String, source: String) {
        try {
            val prefs = getPreferences(context)
            prefs.edit().apply {
                putString(KEY_DEVICE_ID, deviceId)
                putString(KEY_DEVICE_ID_SOURCE, source)
                putLong("saved_timestamp", System.currentTimeMillis())
                apply()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar deviceId: ${e.message}")
        }
    }
    
    /**
     * Retorna as SharedPreferences para armazenamento do deviceId
     */
    private fun getPreferences(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }
    
    /**
     * Limpa o deviceId salvo (útil para testes ou reset manual)
     */
    fun clearDeviceId(context: Context) {
        val prefs = getPreferences(context)
        prefs.edit().clear().apply()
    }
    
    /**
     * Obtém informações sobre o deviceId atual
     */
    fun getDeviceIdInfo(context: Context): Map<String, String> {
        val prefs = getPreferences(context)
        val deviceId = prefs.getString(KEY_DEVICE_ID, "não definido") ?: "não definido"
        val source = prefs.getString(KEY_DEVICE_ID_SOURCE, "nenhuma") ?: "nenhuma"
        val timestamp = prefs.getLong("saved_timestamp", 0)
        
        return mapOf(
            "deviceId" to deviceId,
            "source" to source,
            "timestamp" to if (timestamp > 0) java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(timestamp) else "nunca",
            "displayId" to if (deviceId.length > 8) "...${deviceId.takeLast(8)}" else deviceId
        )
    }
}

