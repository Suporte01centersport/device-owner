package com.mdm.launcher

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mdm.launcher.R

class SetupActivity : AppCompatActivity() {
    
    private lateinit var serverUrlEditText: EditText
    private lateinit var deviceIdEditText: EditText
    private lateinit var saveButton: Button
    private lateinit var setupInstructionsText: TextView
    private lateinit var deviceOwnerStatusText: TextView
    
    private lateinit var sharedPreferences: SharedPreferences
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        
        initViews()
        setupClickListeners()
        loadCurrentSettings()
        checkDeviceOwnerStatus()
    }
    
    private fun initViews() {
        serverUrlEditText = findViewById(R.id.server_url_edit_text)
        deviceIdEditText = findViewById(R.id.device_id_edit_text)
        saveButton = findViewById(R.id.save_button)
        setupInstructionsText = findViewById(R.id.setup_instructions_text)
        deviceOwnerStatusText = findViewById(R.id.device_owner_status_text)
        
        sharedPreferences = getSharedPreferences("mdm_config", Context.MODE_PRIVATE)
    }
    
    private fun setupClickListeners() {
        saveButton.setOnClickListener {
            saveSettings()
        }
    }
    
    private fun loadCurrentSettings() {
        val serverUrl = sharedPreferences.getString("server_url", "ws://192.168.1.100:3002")
        val deviceId = sharedPreferences.getString("device_id", Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID))
        
        serverUrlEditText.setText(serverUrl)
        deviceIdEditText.setText(deviceId)
    }
    
    private fun checkDeviceOwnerStatus() {
        val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val isDeviceOwner = devicePolicyManager.isDeviceOwnerApp(packageName)
        
        if (isDeviceOwner) {
            deviceOwnerStatusText.text = "✅ Device Owner configurado corretamente"
            deviceOwnerStatusText.setTextColor(resources.getColor(android.R.color.holo_green_dark, null))
        } else {
            deviceOwnerStatusText.text = "❌ Device Owner não configurado"
            deviceOwnerStatusText.setTextColor(resources.getColor(android.R.color.holo_red_dark, null))
        }
    }
    
    private fun saveSettings() {
        val serverUrl = serverUrlEditText.text.toString().trim()
        val deviceId = deviceIdEditText.text.toString().trim()
        
        if (serverUrl.isEmpty() || deviceId.isEmpty()) {
            Toast.makeText(this, "Por favor, preencha todos os campos", Toast.LENGTH_SHORT).show()
            return
        }
        
        sharedPreferences.edit()
            .putString("server_url", serverUrl)
            .putString("device_id", deviceId)
            .apply()
        
        Toast.makeText(this, "Configurações salvas com sucesso", Toast.LENGTH_SHORT).show()
        
        // Voltar para MainActivity
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        finish()
    }
}
