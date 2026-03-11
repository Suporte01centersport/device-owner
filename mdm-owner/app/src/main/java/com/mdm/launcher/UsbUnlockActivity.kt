package com.mdm.launcher

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * Tela de desbloqueio USB: quando USB está bloqueado e alguém conecta o cabo,
 * mostra uma tela pedindo a senha 7410 para liberar temporariamente.
 */
class UsbUnlockActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "UsbUnlockActivity"
        private const val USB_UNLOCK_PASSWORD = "7410"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.setBackgroundDrawableResource(android.R.color.black)
        window.decorView.setBackgroundColor(Color.BLACK)

        setContentView(R.layout.activity_usb_unlock)

        val passwordInput = findViewById<EditText>(R.id.usb_password_input)
        val unlockBtn = findViewById<Button>(R.id.usb_unlock_btn)
        val cancelBtn = findViewById<Button>(R.id.usb_cancel_btn)
        val root = window.decorView.rootView

        // Forçar cores brancas
        val white = Color.WHITE
        passwordInput.setTextColor(white)
        passwordInput.setHintTextColor(0xFFCCCCCC.toInt())
        passwordInput.setBackgroundColor(0x40FFFFFF)
        unlockBtn.setTextColor(white)
        cancelBtn.setTextColor(0xFFAAAAAA.toInt())

        (passwordInput.parent as? android.view.ViewGroup)?.let { parent ->
            for (i in 0 until parent.childCount) {
                val child = parent.getChildAt(i)
                (child as? TextView)?.setTextColor(white)
            }
        }
        root.setBackgroundColor(Color.BLACK)

        unlockBtn.setOnClickListener {
            val entered = passwordInput.text?.toString()?.trim() ?: ""
            if (entered == USB_UNLOCK_PASSWORD) {
                Log.d(TAG, "Senha USB correta - desbloqueando USB temporariamente")
                unlockUsb()
                Toast.makeText(this, "USB desbloqueado", Toast.LENGTH_SHORT).show()
                finish()
            } else {
                Toast.makeText(this, "Senha incorreta", Toast.LENGTH_SHORT).show()
                passwordInput.text?.clear()
            }
        }

        cancelBtn.setOnClickListener {
            finish()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                finish()
            }
        })
    }

    private fun unlockUsb() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)

            if (!dpm.isDeviceOwnerApp(packageName)) {
                Log.w(TAG, "Não é Device Owner - não pode liberar USB")
                return
            }

            // Liberar USB file transfer
            dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_USB_FILE_TRANSFER)
            Log.d(TAG, "DISALLOW_USB_FILE_TRANSFER removido")

            // Liberar debugging
            dpm.clearUserRestriction(adminComponent, android.os.UserManager.DISALLOW_DEBUGGING_FEATURES)
            Log.d(TAG, "DISALLOW_DEBUGGING_FEATURES removido")

            // Reabilitar ADB
            try {
                Settings.Global.putInt(contentResolver, Settings.Global.ADB_ENABLED, 1)
                Log.d(TAG, "ADB reabilitado via Settings.Global")
            } catch (e: Exception) {
                Log.w(TAG, "Não foi possível reabilitar ADB: ${e.message}")
            }

            // Marcar USB como temporariamente desbloqueado
            getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("usb_temp_unlocked", true)
                .apply()

        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desbloquear USB: ${e.message}")
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Bloquear teclas de hardware exceto as necessárias para digitar
        val blockKeys = intArrayOf(
            KeyEvent.KEYCODE_HOME, KeyEvent.KEYCODE_APP_SWITCH,
            KeyEvent.KEYCODE_MENU
        )
        if (event.keyCode in blockKeys) return true
        return super.dispatchKeyEvent(event)
    }
}
