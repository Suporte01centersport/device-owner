package com.mdm.launcher.utils

import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.mdm.launcher.data.ReceivedMessage

object MessageManager {
    private const val TAG = "MessageManager"
    private const val PREFS_NAME = "mdm_launcher"
    private const val KEY_MESSAGES = "received_messages"
    private const val MAX_MESSAGES = 5

    fun saveMessage(context: Context, messageContent: String) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val messages = loadMessages(context).toMutableList()

            // Criar nova mensagem
            val newMessage = ReceivedMessage(
                id = "msg_${System.currentTimeMillis()}_${(Math.random() * 10000).toInt()}",
                message = messageContent,
                timestamp = System.currentTimeMillis(),
                read = false
            )

            // Adicionar no topo
            messages.add(0, newMessage)

            // Limitar tamanho (Manter apenas as 5 mais recentes)
            if (messages.size > MAX_MESSAGES) {
                // Remove do final (mais antiga) até ficar com o tamanho máximo
                while (messages.size > MAX_MESSAGES) {
                    messages.removeAt(messages.size - 1)
                }
            }

            // Salvar
            val json = Gson().toJson(messages)
            prefs.edit().putString(KEY_MESSAGES, json).apply()

            // Notificar atualização
            broadcastUpdate(context, messages)

        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar mensagem", e)
        }
    }

    fun loadMessages(context: Context): List<ReceivedMessage> {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY_MESSAGES, null)
            
            if (json.isNullOrEmpty()) {
                emptyList()
            } else {
                val type = object : TypeToken<List<ReceivedMessage>>() {}.type
                Gson().fromJson(json, type) ?: emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar mensagens", e)
            emptyList()
        }
    }

    fun markAllAsRead(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val messages = loadMessages(context).toMutableList()
            
            var changed = false
            messages.forEach { 
                if (!it.read) {
                    it.read = true
                    changed = true
                }
            }

            if (changed) {
                val json = Gson().toJson(messages)
                prefs.edit().putString(KEY_MESSAGES, json).apply()
                broadcastUpdate(context, messages)
                Log.d(TAG, "Todas as mensagens marcadas como lidas")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao marcar mensagens como lidas", e)
        }
    }

    fun getUnreadCount(context: Context): Int {
        return loadMessages(context).count { !it.read }
    }

    private fun broadcastUpdate(context: Context, messages: List<ReceivedMessage>) {
        val unreadCount = messages.count { !it.read }
        val intent = Intent("com.mdm.launcher.MESSAGE_RECEIVED")
        intent.putExtra("unread_count", unreadCount)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
        Log.d(TAG, "Broadcast enviado: $unreadCount não lidas")
    }
}

