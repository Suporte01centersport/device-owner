package com.mdm.launcher.activities

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.app.ActivityCompat
import com.google.android.material.switchmaterial.SwitchMaterial
import com.mdm.launcher.R
import com.mdm.launcher.utils.SetupManager

class PermissionsActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PermissionsActivity"
        private const val REQUEST_CODE_NOTIFICATIONS = 101
        private const val REQUEST_CODE_BATTERY = 105
        private const val REQUEST_CODE_LAUNCHER = 106
    }

    private lateinit var setupManager: SetupManager
    private lateinit var btnFinish: Button
    
    // Switches
    private lateinit var switchDeviceOwner: SwitchMaterial
    private lateinit var switchLauncher: SwitchMaterial
    private lateinit var switchNotifications: SwitchMaterial
    private lateinit var switchLocation: SwitchMaterial
    private lateinit var switchUsageStats: SwitchMaterial
    private lateinit var switchBattery: SwitchMaterial
    
    // Flag para evitar atualizações durante mudanças programáticas
    private var isUpdatingSwitches = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // #region agent log
        try {
            val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run2\",\"hypothesisId\":\"theme_fix\",\"location\":\"PermissionsActivity.kt:onCreate\",\"message\":\"PermissionsActivity created\",\"data\":{},\"timestamp\":" + System.currentTimeMillis() + "}\n"
            val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
            logFile.appendText(logPayload)
        } catch (e: Exception) {}
        // #endregion
        setContentView(R.layout.activity_permissions)
        
        setupManager = SetupManager(this)
        
        setupToolbar()
        bindViews()
        setupListeners()
    }

    override fun onResume() {
        super.onResume()
        checkPermissionsAndUpdateUI()
    }

    private fun setupToolbar() {
        // #region agent log
        try {
            val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run2\",\"hypothesisId\":\"theme_fix\",\"location\":\"PermissionsActivity.kt:setupToolbar\",\"message\":\"Before setSupportActionBar\",\"data\":{},\"timestamp\":" + System.currentTimeMillis() + "}\n"
            val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
            logFile.appendText(logPayload)
        } catch (e: Exception) {}
        // #endregion
        val toolbar = findViewById<Toolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        // #region agent log
        try {
            val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run2\",\"hypothesisId\":\"theme_fix\",\"location\":\"PermissionsActivity.kt:setupToolbar\",\"message\":\"After setSupportActionBar\",\"data\":{},\"timestamp\":" + System.currentTimeMillis() + "}\n"
            val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
            logFile.appendText(logPayload)
        } catch (e: Exception) {}
        // #endregion
        supportActionBar?.title = "Configuração Inicial"
    }

    private fun bindViews() {
        btnFinish = findViewById(R.id.btn_finish_setup)
        
        // Device Owner
        val layoutDeviceOwner = findViewById<View>(R.id.item_device_owner)
        layoutDeviceOwner.findViewById<TextView>(R.id.text_permission_title).text = "Device Owner"
        layoutDeviceOwner.findViewById<TextView>(R.id.text_permission_description).text = "Permissão administrativa principal (Requer configuração via ADB/QR)."
        switchDeviceOwner = layoutDeviceOwner.findViewById(R.id.switch_permission)
        switchDeviceOwner.isEnabled = false // Não pode ser ativado pelo usuário, apenas verificado

        // Default Launcher
        val layoutLauncher = findViewById<View>(R.id.item_default_launcher)
        layoutLauncher.findViewById<TextView>(R.id.text_permission_title).text = "Launcher Padrão"
        layoutLauncher.findViewById<TextView>(R.id.text_permission_description).text = "Definir este app como a tela inicial do dispositivo."
        switchLauncher = layoutLauncher.findViewById(R.id.switch_permission)

        // Notifications
        val layoutNotifications = findViewById<View>(R.id.item_notifications)
        layoutNotifications.findViewById<TextView>(R.id.text_permission_title).text = "Notificações"
        layoutNotifications.findViewById<TextView>(R.id.text_permission_description).text = "Permitir que o app envie notificações importantes."
        switchNotifications = layoutNotifications.findViewById(R.id.switch_permission)
        
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            layoutNotifications.visibility = View.GONE
            findViewById<View>(R.id.divider_notifications).visibility = View.GONE
        }

        // Location
        val layoutLocation = findViewById<View>(R.id.item_location)
        layoutLocation.findViewById<TextView>(R.id.text_permission_title).text = "Localização"
        layoutLocation.findViewById<TextView>(R.id.text_permission_description).text = "Permite o rastreamento em tempo real e geofencing."
        switchLocation = layoutLocation.findViewById(R.id.switch_permission)

        // Usage Stats
        val layoutUsageStats = findViewById<View>(R.id.item_usage_stats)
        layoutUsageStats.findViewById<TextView>(R.id.text_permission_title).text = "Estatísticas de Uso"
        layoutUsageStats.findViewById<TextView>(R.id.text_permission_description).text = "Necessário para contabilizar os apps acessados no relatório."
        switchUsageStats = layoutUsageStats.findViewById(R.id.switch_permission)

        // Battery
        val layoutBattery = findViewById<View>(R.id.item_battery_optimization)
        layoutBattery.findViewById<TextView>(R.id.text_permission_title).text = "Bateria Irrestrita"
        layoutBattery.findViewById<TextView>(R.id.text_permission_description).text = "Permite que o app funcione em segundo plano sem restrições."
        switchBattery = layoutBattery.findViewById(R.id.switch_permission)
    }

    private fun setupListeners() {
        // Launcher - não pode ser desativado se já for padrão
        switchLauncher.setOnCheckedChangeListener { _, isChecked ->
            // Ignorar se for atualização programática
            if (isUpdatingSwitches) return@setOnCheckedChangeListener
            
            // #region agent log
            try {
                val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\",\"location\":\"PermissionsActivity.kt:switchLauncher\",\"message\":\"Switch launcher changed\",\"data\":{\"isChecked\":$isChecked,\"hasPermission\":${setupManager.isDefaultLauncher()}},\"timestamp\":" + System.currentTimeMillis() + "}\n"
                val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
                logFile.appendText(logPayload)
            } catch (e: Exception) {}
            // #endregion
            
            val isDefaultLauncher = setupManager.isDefaultLauncher()
            
            if (!isChecked && isDefaultLauncher) {
                // Tentou desativar mas já é padrão - reverter
                isUpdatingSwitches = true
                switchLauncher.isChecked = true
                isUpdatingSwitches = false
                Toast.makeText(this, "Esta permissão é obrigatória e já está ativa.", Toast.LENGTH_SHORT).show()
            } else if (isChecked && !isDefaultLauncher) {
                // Usuário quer ativar - solicitar permissão IMEDIATAMENTE
                requestLauncherSelection()
            }
        }

        // Notificações - solicitar quando ativar
        switchNotifications.setOnCheckedChangeListener { _, isChecked ->
            // Ignorar se for atualização programática
            if (isUpdatingSwitches) return@setOnCheckedChangeListener
            
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                setupManager.hasNotificationPermission()
            } else {
                true
            }
            
            if (isChecked && !hasPermission) {
                // Usuário quer ativar - solicitar permissão IMEDIATAMENTE
                setupManager.requestNotificationPermission()
            } else if (!isChecked && hasPermission) {
                // Tentou desativar mas tem permissão - reverter
                isUpdatingSwitches = true
                switchNotifications.isChecked = true
                isUpdatingSwitches = false
                Toast.makeText(this, "Esta permissão já foi concedida.", Toast.LENGTH_SHORT).show()
            }
        }

        // Localização - solicitar quando ativar
        switchLocation.setOnCheckedChangeListener { _, isChecked ->
            // Ignorar se for atualização programática
            if (isUpdatingSwitches) return@setOnCheckedChangeListener
            
            val hasPermission = setupManager.hasLocationPermission()
            
            if (isChecked && !hasPermission) {
                // Usuário quer ativar - solicitar permissão IMEDIATAMENTE
                setupManager.requestLocationPermission()
            } else if (!isChecked && hasPermission) {
                // Tentou desativar mas tem permissão - reverter
                isUpdatingSwitches = true
                switchLocation.isChecked = true
                isUpdatingSwitches = false
                Toast.makeText(this, "Esta permissão já foi concedida.", Toast.LENGTH_SHORT).show()
            }
        }

        // Usage Stats - solicitar quando ativar
        switchUsageStats.setOnCheckedChangeListener { _, isChecked ->
            // Ignorar se for atualização programática
            if (isUpdatingSwitches) return@setOnCheckedChangeListener
            
            val hasPermission = setupManager.hasUsageStatsPermission()
            
            if (isChecked && !hasPermission) {
                // Usuário quer ativar - solicitar permissão IMEDIATAMENTE
                setupManager.requestUsageStatsPermission()
            } else if (!isChecked && hasPermission) {
                // Tentou desativar mas tem permissão - reverter
                isUpdatingSwitches = true
                switchUsageStats.isChecked = true
                isUpdatingSwitches = false
                Toast.makeText(this, "Esta permissão já foi concedida.", Toast.LENGTH_SHORT).show()
            }
        }

        // Battery Optimization - solicitar quando ativar
        switchBattery.setOnCheckedChangeListener { _, isChecked ->
            // Ignorar se for atualização programática
            if (isUpdatingSwitches) return@setOnCheckedChangeListener
            
            // #region agent log
            try {
                val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\",\"location\":\"PermissionsActivity.kt:switchBattery\",\"message\":\"Switch battery changed\",\"data\":{\"isChecked\":$isChecked,\"hasPermission\":${setupManager.hasBatteryOptimizationPermission()}},\"timestamp\":" + System.currentTimeMillis() + "}\n"
                val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
                logFile.appendText(logPayload)
            } catch (e: Exception) {}
            // #endregion
            
            val hasPermission = setupManager.hasBatteryOptimizationPermission()
            
            if (isChecked && !hasPermission) {
                // Usuário quer ativar - solicitar permissão IMEDIATAMENTE
                setupManager.requestBatteryOptimizationPermission()
            } else if (!isChecked && hasPermission) {
                // Tentou desativar mas tem permissão - reverter
                isUpdatingSwitches = true
                switchBattery.isChecked = true
                isUpdatingSwitches = false
                Toast.makeText(this, "Esta permissão já foi concedida.", Toast.LENGTH_SHORT).show()
            }
        }

        btnFinish.setOnClickListener {
            if (checkAllPermissions()) {
                setupManager.setSetupCompleted(true)
                // Reiniciar a MainActivity para garantir inicialização limpa
                val intent = Intent(this, MainActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                finish()
            } else {
                Toast.makeText(this, "Por favor, conceda todas as permissões necessárias.", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun checkPermissionsAndUpdateUI() {
        // Evitar que listeners sejam acionados durante atualização programática
        isUpdatingSwitches = true
        
        try {
            val isDeviceOwner = setupManager.isDeviceOwner()
            switchDeviceOwner.isChecked = isDeviceOwner
            
            val isDefaultLauncher = setupManager.isDefaultLauncher()
            switchLauncher.isChecked = isDefaultLauncher
            switchLauncher.isEnabled = !isDefaultLauncher

            val hasNotifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                setupManager.hasNotificationPermission()
            } else {
                true
            }
            switchNotifications.isChecked = hasNotifications
            switchNotifications.isEnabled = !hasNotifications

            val hasLocation = setupManager.hasLocationPermission()
            switchLocation.isChecked = hasLocation
            switchLocation.isEnabled = !hasLocation

            val hasUsageStats = setupManager.hasUsageStatsPermission()
            switchUsageStats.isChecked = hasUsageStats
            switchUsageStats.isEnabled = !hasUsageStats

            val hasBattery = setupManager.hasBatteryOptimizationPermission()
            switchBattery.isChecked = hasBattery
            switchBattery.isEnabled = !hasBattery

            val allGranted = checkAllPermissions()
            btnFinish.isEnabled = allGranted
            btnFinish.alpha = if (allGranted) 1.0f else 0.5f
        } finally {
            isUpdatingSwitches = false
        }
    }
    
    private fun checkAllPermissions(): Boolean {
        // Device Owner não é estritamente obrigatório para o usuário ativar aqui (pois requer ADB),
        // mas idealmente deveria ser. Vamos focar nas permissões que o usuário pode dar.
        
        var allGranted = true
        
        if (!setupManager.isDefaultLauncher()) allGranted = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !setupManager.hasNotificationPermission()) allGranted = false
        if (!setupManager.hasLocationPermission()) allGranted = false
        if (!setupManager.hasUsageStatsPermission()) allGranted = false
        if (!setupManager.hasBatteryOptimizationPermission()) allGranted = false
        
        return allGranted
    }

    private fun requestLauncherSelection() {
        // #region agent log
        try {
            val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\",\"location\":\"PermissionsActivity.kt:requestLauncherSelection\",\"message\":\"Requesting launcher selection\",\"data\":{},\"timestamp\":" + System.currentTimeMillis() + "}\n"
            val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
            logFile.appendText(logPayload)
        } catch (e: Exception) {}
        // #endregion
        // Usar setupManager para garantir que o resultado seja processado corretamente
        setupManager.requestLauncherSelection()
    }
    
    // Tratamento de resultados de permissões de runtime
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // #region agent log
        try {
            val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\",\"location\":\"PermissionsActivity.kt:onRequestPermissionsResult\",\"message\":\"Permission result received\",\"data\":{\"requestCode\":$requestCode,\"granted\":${grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED}}},\"timestamp\":" + System.currentTimeMillis() + "}\n"
            val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
            logFile.appendText(logPayload)
        } catch (e: Exception) {}
        // #endregion
        // Delegar para SetupManager para processar
        setupManager.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // A atualização da UI acontecerá no onResume, mas podemos forçar aqui se necessário
        checkPermissionsAndUpdateUI()
    }
    
    // #region agent log
    // CRÍTICO: PermissionsActivity não implementa onActivityResult, mas SetupManager usa startActivityForResult
    // #endregion
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        // #region agent log
        try {
            val logPayload = "{\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\",\"location\":\"PermissionsActivity.kt:onActivityResult\",\"message\":\"Activity result received\",\"data\":{\"requestCode\":$requestCode,\"resultCode\":$resultCode},\"timestamp\":" + System.currentTimeMillis() + "}\n"
            val logFile = java.io.File("c:\\Desenvolvimento\\device-owner\\.cursor\\debug.log")
            logFile.appendText(logPayload)
        } catch (e: Exception) {}
        // #endregion
        // Delegar para SetupManager para processar
        setupManager.onActivityResult(requestCode, resultCode, data)
        // Atualizar UI após resultado
        checkPermissionsAndUpdateUI()
    }
}

