package com.mdm.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import android.util.Log
import android.graphics.Color
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * Tela de bloqueio: tela preta com cadeado.
 * Mensagem: "Peça para seu líder desbloquear".
 * Líder digita senha de 4 dígitos (admin_password) para desbloquear.
 * Também pode desbloquear remotamente via painel MDM.
 */
class LockScreenActivity : AppCompatActivity() {

    private var unlockReceiver: BroadcastReceiver? = null

    companion object {
        private const val TAG = "LockScreenActivity"
        const val ACTION_UNLOCK = "com.mdm.launcher.UNLOCK_DEVICE"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Manter tela ligada e mostrar sobre qualquer tela de bloqueio do sistema
        // NÃO usar bloqueio padrão do Android - só a tela MDM com cadeado (estática)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        // Nossa tela fica na frente - NÃO usar FLAG_DISMISS_KEYGUARD (evita ir para senha/PIN/padrão)
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        // Manter tela ligada - evita que ao desligar/ligar o sistema mostre lock padrão
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Impedir screenshots e gravação
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        // Garantir fundo preto e conteúdo opaco (evita tela em branco ou invisível)
        window.setBackgroundDrawableResource(android.R.color.black)
        window.decorView.setBackgroundColor(Color.BLACK)

        setContentView(R.layout.activity_lock_screen)

        val passwordInput = findViewById<EditText>(R.id.lock_password_input)
        val unlockBtn = findViewById<Button>(R.id.lock_unlock_btn)
        val root = window.decorView.rootView

        // Garantir visibilidade: forçar cores brancas (fallback se tema não aplicar)
        val white = Color.WHITE
        passwordInput.setTextColor(white)
        passwordInput.setHintTextColor(0xFFCCCCCC.toInt())
        passwordInput.setBackgroundColor(0x40FFFFFF)
        passwordInput.visibility = android.view.View.VISIBLE
        unlockBtn.setTextColor(white)
        unlockBtn.visibility = android.view.View.VISIBLE
        // TextViews do layout (ícone e mensagem)
        (passwordInput.parent as? android.view.ViewGroup)?.let { parent ->
            for (i in 0 until parent.childCount) {
                val child = parent.getChildAt(i)
                (child as? TextView)?.setTextColor(white)
                child?.visibility = android.view.View.VISIBLE
            }
        }
        root.setBackgroundColor(Color.BLACK)
        root.visibility = android.view.View.VISIBLE

        unlockBtn.setOnClickListener {
            val entered = passwordInput.text?.toString()?.trim() ?: ""
            val savedPassword = getSharedPreferences("mdm_launcher", Context.MODE_PRIVATE)
                .getString("admin_password", "") ?: ""
            if (entered == savedPassword) {
                Log.d(TAG, "Senha correta - desbloqueando")
                finishLockScreen()
            } else {
                Toast.makeText(this, "Senha incorreta", Toast.LENGTH_SHORT).show()
                passwordInput.text?.clear()
            }
        }

        // Garantir que bloqueio padrão Android está desabilitado - só nossa tela (cadeado estático)
        com.mdm.launcher.utils.DevicePolicyHelper.disableLockScreen(this)

        // Bloquear botão voltar - não permite sair
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Ignorar - não faz nada
            }
        })

        // Registrar para receber comando de desbloqueio remoto
        unlockReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == ACTION_UNLOCK) {
                    Log.d(TAG, "Comando de desbloqueio recebido - finalizando tela de bloqueio")
                    finishLockScreen()
                }
            }
        }
        val filter = IntentFilter(ACTION_UNLOCK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(unlockReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(unlockReceiver, filter)
        }

        // Lock Task Mode - impede home, recentes, troca de app. Só sai com desbloqueio remoto.
        try {
            startLockTask()
            Log.d(TAG, "Lock Task Mode ativado - dispositivo travado até desbloqueio remoto")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ativar Lock Task Mode: ${e.message}")
        }
    }

    override fun onResume() {
        super.onResume()
        // Reforçar desabilitar keyguard toda vez que a tela volta (ex: usuário ligou a tela)
        com.mdm.launcher.utils.DevicePolicyHelper.disableLockScreen(this)
    }

    /** Permitir toques no input de senha e botão Desbloquear */
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        return super.dispatchTouchEvent(ev)
    }

    /** Consumir teclas físicas - impede sair da tela de cadeado com power/volume/home/etc */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val hardwareKeys = intArrayOf(
                KeyEvent.KEYCODE_POWER, KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN,
                KeyEvent.KEYCODE_VOLUME_MUTE, KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_HOME,
                KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_CAMERA, KeyEvent.KEYCODE_APP_SWITCH,
                KeyEvent.KEYCODE_ESCAPE
            )
            if (event.keyCode in hardwareKeys) return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        return true
    }

    private fun finishLockScreen() {
        try {
            stopLockTask()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar Lock Task: ${e.message}")
        }
        finish()
    }

    override fun onDestroy() {
        try {
            unlockReceiver?.let { unregisterReceiver(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao desregistrar receiver: ${e.message}")
        }
        super.onDestroy()
    }
}
