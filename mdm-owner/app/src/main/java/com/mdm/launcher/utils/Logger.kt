package com.mdm.launcher.utils

import android.util.Log

/**
 * Classe utilitária para logging com suporte a controle por BuildConfig
 * Em produção (release), apenas logs de WARN e ERROR são mostrados
 */
object Logger {
    private const val DEFAULT_TAG = "MDMLauncher"
    
    // Controle global de logging (pode ser alterado em runtime se necessário)
    // Por padrão, todos os logs estão habilitados. Em produção, setar para false
    var isDebugMode = true
    
    fun v(tag: String = DEFAULT_TAG, message: String) {
        if (isDebugMode) {
            Log.v(tag, message)
        }
    }
    
    fun d(tag: String = DEFAULT_TAG, message: String) {
        if (isDebugMode) {
            Log.d(tag, message)
        }
    }
    
    fun i(tag: String = DEFAULT_TAG, message: String) {
        if (isDebugMode) {
            Log.i(tag, message)
        }
    }
    
    fun w(tag: String = DEFAULT_TAG, message: String, throwable: Throwable? = null) {
        // WARN sempre é mostrado
        if (throwable != null) {
            Log.w(tag, message, throwable)
        } else {
            Log.w(tag, message)
        }
    }
    
    fun e(tag: String = DEFAULT_TAG, message: String, throwable: Throwable? = null) {
        // ERROR sempre é mostrado
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }
    
    /**
     * Log apenas em situações críticas - sempre é mostrado
     */
    fun wtf(tag: String = DEFAULT_TAG, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.wtf(tag, message, throwable)
        } else {
            Log.wtf(tag, message)
        }
    }
}

