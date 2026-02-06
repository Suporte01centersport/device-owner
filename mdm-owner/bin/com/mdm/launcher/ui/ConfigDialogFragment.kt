package com.mdm.launcher.ui

import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import androidx.fragment.app.DialogFragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.mdm.launcher.R
import com.mdm.launcher.data.ReceivedMessage
import com.mdm.launcher.service.WebSocketService
import com.mdm.launcher.utils.DeviceIdManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ConfigDialogFragment : DialogFragment() {
    
    companion object {
        private const val TAG = "ConfigDialogFragment"
    }
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.dialog_config, container, false)
        
        // Fechar dialog
        view.findViewById<View>(R.id.btn_close).setOnClickListener {
            dismiss()
        }
        
        // Salvar referências antes de fazer dismiss para evitar IllegalStateException
        val fragmentManager = requireActivity().supportFragmentManager
        val context = requireContext()
        
        // Opção 1: Enviar Mensagem
        view.findViewById<View>(R.id.option_send_message).setOnClickListener {
            dismiss()
            showSendMessageDialog(fragmentManager, context)
        }
        
        // Opção 2: Ver Histórico
        view.findViewById<View>(R.id.option_view_history).setOnClickListener {
            dismiss()
            showMessageHistoryDialog(fragmentManager, context)
        }
        
        // Opção 3: Mudar Nome
        view.findViewById<View>(R.id.option_change_name).setOnClickListener {
            dismiss()
            showChangeNameDialog(fragmentManager, context)
        }
        
        return view
    }
    
    override fun onResume() {
        super.onResume()
        
        // Verificar se deve abrir o histórico automaticamente (via notificação)
        if (arguments?.getBoolean("open_history", false) == true) {
            dismiss()
            context?.let { ctx ->
                // Marcar como lidas imediatamente ao abrir via notificação
                com.mdm.launcher.utils.MessageManager.markAllAsRead(ctx)
                showMessageHistoryDialog(parentFragmentManager, ctx)
            }
        }
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val dialog = super.onCreateDialog(savedInstanceState)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        return dialog
    }
    
    private fun showSendMessageDialog(fragmentManager: androidx.fragment.app.FragmentManager, context: Context) {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_send_message)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        
        val editMessage = dialog.findViewById<android.widget.EditText>(R.id.edit_message)
        val btnCancel = dialog.findViewById<android.widget.Button>(R.id.btn_cancel)
        val btnSend = dialog.findViewById<android.widget.Button>(R.id.btn_send)
        
        btnCancel.setOnClickListener {
            dialog.dismiss()
            // Voltar ao modal principal usando a referência salva do fragment manager
            val mainDialog = ConfigDialogFragment()
            mainDialog.show(fragmentManager, "ConfigDialog")
        }
        
        btnSend.setOnClickListener {
            val message = editMessage.text.toString().trim()
            if (message.isNotEmpty()) {
                sendSupportMessage(message, context)
                dialog.dismiss()
                // Voltar ao modal principal após enviar mensagem
                val mainDialog = ConfigDialogFragment()
                mainDialog.show(fragmentManager, "ConfigDialog")
            }
        }
        
        dialog.show()
    }
    
    private fun showMessageHistoryDialog(fragmentManager: androidx.fragment.app.FragmentManager, context: Context) {
        // Marcar mensagens como lidas ao abrir o histórico
        com.mdm.launcher.utils.MessageManager.markAllAsRead(context)

        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_message_history)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        
        // Configurar tamanho do dialog - adaptável mas com limites
        val window = dialog.window
        val displayMetrics = context.resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        val recyclerView = dialog.findViewById<RecyclerView>(R.id.recycler_messages)
        val emptyStateContainer = dialog.findViewById<android.widget.LinearLayout>(R.id.empty_state_container)
        val emptyText = dialog.findViewById<android.widget.TextView>(R.id.empty_text)
        val btnCloseIcon = dialog.findViewById<android.widget.ImageButton>(R.id.btn_close_icon)
        
        // Carregar mensagens e limitar a 5 (as mais recentes)
        // Usando MessageManager
        val allMessages = com.mdm.launcher.utils.MessageManager.loadMessages(context)
        val messages = allMessages.take(5) // Limitar a 5 mensagens mais recentes
        
        if (messages.isEmpty()) {
            // Mostrar estado vazio quando não há mensagens
            recyclerView.visibility = View.GONE
            emptyStateContainer.visibility = View.VISIBLE
            
            // Dialog compacto quando vazio
            window?.setLayout(
                (screenWidth * 0.9).toInt(),
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            )
        } else {
            // Mostrar lista de mensagens (máximo 5)
            recyclerView.visibility = View.VISIBLE
            emptyStateContainer.visibility = View.GONE
            
            val adapter = MessageHistoryAdapter(messages)
            recyclerView.layoutManager = LinearLayoutManager(context)
            recyclerView.adapter = adapter
            
            // Calcular altura baseada no número real de mensagens no adapter (máximo 5)
            val itemHeight = (120 * displayMetrics.density).toInt()
            val headerHeight = (100 * displayMetrics.density).toInt() // Título + botão + margens
            val paddingHeight = (32 * displayMetrics.density).toInt() // Margens do RecyclerView
            val itemCount = messages.size
            val listHeight = (itemHeight * itemCount) + paddingHeight
            val maxListHeight = (screenHeight * 0.5).toInt() // Máximo 50% da tela para a lista
            val finalListHeight = listHeight.coerceAtMost(maxListHeight)
            
            // Definir altura do RecyclerView antes de mostrar
            val layoutParams = recyclerView.layoutParams
            layoutParams.height = finalListHeight
            recyclerView.layoutParams = layoutParams
            
            // Calcular altura total do dialog
            val calculatedHeight = finalListHeight + headerHeight
            val maxHeight = (screenHeight * 0.7).toInt() // Máximo 70% da tela
            
            // Configurar tamanho antes de mostrar para evitar animação estranha
            window?.setLayout(
                (screenWidth * 0.9).toInt(),
                calculatedHeight.coerceAtMost(maxHeight)
            )
        }
        
        btnCloseIcon.setOnClickListener {
            dialog.dismiss()
            // Voltar ao modal principal usando a referência salva do fragment manager
            val mainDialog = ConfigDialogFragment()
            mainDialog.show(fragmentManager, "ConfigDialog")
        }
        
        dialog.show()
    }
    
    private fun showChangeNameDialog(fragmentManager: androidx.fragment.app.FragmentManager, context: Context) {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_change_name)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        
        val editName = dialog.findViewById<android.widget.EditText>(R.id.edit_name)
        val editPassword = dialog.findViewById<android.widget.EditText>(R.id.edit_password)
        val errorText = dialog.findViewById<android.widget.TextView>(R.id.error_text)
        val btnCancel = dialog.findViewById<android.widget.Button>(R.id.btn_cancel)
        val btnSave = dialog.findViewById<android.widget.Button>(R.id.btn_save)
        
        // Carregar nome atual
        val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
        val currentName = prefs.getString("custom_device_name", "") ?: ""
        if (currentName.isNotEmpty()) {
            editName.setText(currentName)
        }
        
        btnCancel.setOnClickListener {
            dialog.dismiss()
            // Voltar ao modal principal usando a referência salva do fragment manager
            val mainDialog = ConfigDialogFragment()
            mainDialog.show(fragmentManager, "ConfigDialog")
        }
        
        btnSave.setOnClickListener {
            val newName = editName.text.toString().trim()
            val password = editPassword.text.toString()
            
            if (newName.isEmpty()) {
                errorText.text = "O nome não pode estar vazio"
                errorText.visibility = View.VISIBLE
                return@setOnClickListener
            }
            
            if (password.isEmpty()) {
                errorText.text = "A senha de administrador é obrigatória"
                errorText.visibility = View.VISIBLE
                return@setOnClickListener
            }
            
            // Verificar senha
            val adminPassword = prefs.getString("admin_password", "admin123") ?: "admin123"
            if (password != adminPassword) {
                errorText.text = "Senha de administrador incorreta"
                errorText.visibility = View.VISIBLE
                return@setOnClickListener
            }
            
            // Salvar novo nome
            prefs.edit().putString("custom_device_name", newName).apply()
            
            // Enviar device_status atualizado
            val serviceIntent = Intent(context, WebSocketService::class.java)
            serviceIntent.action = "com.mdm.launcher.SEND_DEVICE_STATUS"
            context.startService(serviceIntent)
            
            dialog.dismiss()
            // Voltar ao modal principal após salvar nome
            val mainDialog = ConfigDialogFragment()
            mainDialog.show(fragmentManager, "ConfigDialog")
        }
        
        dialog.show()
    }
    
    private fun sendSupportMessage(message: String, context: Context) {
        try {
            val deviceId = DeviceIdManager.getDeviceId(context)
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val customName = prefs.getString("custom_device_name", "") ?: ""
            val deviceName = if (customName.isNotEmpty()) {
                customName
            } else {
                "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
            }
            
            val supportMessage = mapOf(
                "type" to "support_message",
                "deviceId" to deviceId,
                "deviceName" to deviceName,
                "message" to message,
                "timestamp" to System.currentTimeMillis(),
                "androidVersion" to android.os.Build.VERSION.RELEASE,
                "model" to android.os.Build.MODEL
            )
            
            val gson = Gson()
            val jsonMessage = gson.toJson(supportMessage)
            
            val serviceIntent = Intent(context, WebSocketService::class.java).apply {
                putExtra("message", jsonMessage)
                action = "com.mdm.launcher.SEND_MESSAGE"
            }
            context.startService(serviceIntent)
            
            Log.d(TAG, "Mensagem de suporte enviada: $message")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar mensagem de suporte", e)
        }
    }
    
    private fun loadReceivedMessages(context: Context): List<ReceivedMessage> {
        return try {
            val prefs = context.getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
            val messagesJson = prefs.getString("received_messages", null)
            
            if (messagesJson != null && messagesJson.isNotEmpty()) {
                val type = object : TypeToken<List<ReceivedMessage>>() {}.type
                Gson().fromJson<List<ReceivedMessage>>(messagesJson, type) ?: emptyList()
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar mensagens recebidas", e)
            emptyList()
        }
    }
    
    private class MessageHistoryAdapter(
        private val messages: List<ReceivedMessage>
    ) : RecyclerView.Adapter<MessageHistoryAdapter.ViewHolder>() {
        
        class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val messageText: android.widget.TextView = itemView.findViewById(R.id.message_text)
            val messageTimestamp: android.widget.TextView = itemView.findViewById(R.id.message_timestamp)
        }
        
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_message_history, parent, false)
            return ViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val message = messages[position]
            holder.messageText.text = message.message
            
            // Formatar timestamp
            val timestamp = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault())
                .format(java.util.Date(message.timestamp))
            holder.messageTimestamp.text = timestamp
        }
        
        override fun getItemCount(): Int = messages.size
    }
}

