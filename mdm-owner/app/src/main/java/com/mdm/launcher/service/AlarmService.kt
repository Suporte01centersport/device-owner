package com.mdm.launcher.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import androidx.core.app.ServiceCompat
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.AudioFocusRequest
import android.os.Build
import android.os.IBinder
import android.os.UserManager
import android.util.Log
import com.mdm.launcher.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.DeviceAdminReceiver

/**
 * Serviço de alarme que toca som contínuo até ser parado.
 * Bloqueia alteração de volume (aumentar/diminuir) quando Device Owner.
 */
class AlarmService : Service() {

    private var audioTrack: AudioTrack? = null
    private var volumeRestrictionApplied = false

    companion object {
        private const val TAG = "AlarmService"
        private const val NOTIFICATION_ID = 1002
        private const val CHANNEL_ID = "alarm_service_channel"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START" -> {
                if (Build.VERSION.SDK_INT >= 34) {
                    ServiceCompat.startForeground(
                        this, NOTIFICATION_ID, createNotification(),
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    )
                } else {
                    startForeground(NOTIFICATION_ID, createNotification())
                }
                applyVolumeRestriction()
                setAlarmVolumeToMax()
                showLockScreen()  // Tela de cadeado primeiro - visível imediatamente
                startAlarmSound() // Sirene de evacuação no volume máximo
                showKeyBlockOverlay()
            }
            "STOP" -> {
                hideKeyBlockOverlay()
                stopAlarmSound()
                removeVolumeRestriction()
                stopForeground(true)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        hideKeyBlockOverlay()
        stopAlarmSound()
        removeVolumeRestriction()
        super.onDestroy()
    }

    private var keyBlockOverlay: android.view.View? = null

    /** Overlay que bloqueia power/volume - impede menu desligar e alteração de volume */
    private fun showKeyBlockOverlay() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                !android.provider.Settings.canDrawOverlays(this)) return
            val wm = getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
            val overlay = object : android.view.View(this) {
                override fun dispatchKeyEvent(event: android.view.KeyEvent?): Boolean {
                    if (event != null && event.action == android.view.KeyEvent.ACTION_DOWN) {
                        when (event.keyCode) {
                            android.view.KeyEvent.KEYCODE_POWER,
                            android.view.KeyEvent.KEYCODE_VOLUME_UP,
                            android.view.KeyEvent.KEYCODE_VOLUME_DOWN,
                            android.view.KeyEvent.KEYCODE_VOLUME_MUTE -> return true
                        }
                    }
                    return super.dispatchKeyEvent(event)
                }
            }.apply {
                isFocusable = true
                isFocusableInTouchMode = true
            }
            val params = android.view.WindowManager.LayoutParams().apply {
                width = android.view.WindowManager.LayoutParams.MATCH_PARENT
                height = android.view.WindowManager.LayoutParams.MATCH_PARENT
                type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    android.view.WindowManager.LayoutParams.TYPE_PHONE
                }
                flags = android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                format = android.graphics.PixelFormat.TRANSPARENT
            }
            wm.addView(overlay, params)
            overlay.requestFocus()
            keyBlockOverlay = overlay
            Log.d(TAG, "Overlay de bloqueio de teclas ativo (power/volume)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro overlay teclas: ${e.message}")
        }
    }

    private fun hideKeyBlockOverlay() {
        try {
            keyBlockOverlay?.let {
                (getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager).removeView(it)
            }
            keyBlockOverlay = null
        } catch (_: Exception) {}
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Alarme de Localização",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Som de alerta para localizar o dispositivo"
                setSound(null, null)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("🔊 Alarme Ativo")
            .setContentText("Toque o botão Som Alerta novamente para parar")
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun showLockScreen() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(packageName)) return
            com.mdm.launcher.utils.DevicePolicyHelper.disableLockScreen(this)
            val adminComponent = ComponentName(this, DeviceAdminReceiver::class.java)
            try {
                dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
            } catch (e: Exception) {
                Log.e(TAG, "setLockTaskPackages falhou: ${e.message}")
            }
            // Bloquear tudo na tela de bloqueio com alarme (sem status bar, sem notificações)
            com.mdm.launcher.utils.DevicePolicyHelper.disableLockTaskFeatures(this)
            val lockIntent = Intent(this, com.mdm.launcher.LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_HISTORY or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    addFlags(0x00080000 or 0x00100000) // FLAG_ACTIVITY_SHOW_WHEN_LOCKED | FLAG_ACTIVITY_TURN_SCREEN_ON
                }
            }
            startActivity(lockIntent)
            Log.d(TAG, "Tela de cadeado exibida (sirene ativa)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao exibir tela de cadeado: ${e.message}")
        }
    }

    private fun setAlarmVolumeToMax() {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.mode = AudioManager.MODE_NORMAL
            am.isSpeakerphoneOn = true
            // Todos os streams no máximo - sirene no volume máximo que o celular aguenta
            for (stream in intArrayOf(
                AudioManager.STREAM_ALARM,
                AudioManager.STREAM_MUSIC,
                AudioManager.STREAM_RING,
                AudioManager.STREAM_NOTIFICATION,
                AudioManager.STREAM_SYSTEM
            )) {
                try {
                    val maxVol = am.getStreamMaxVolume(stream)
                    am.setStreamVolume(stream, maxVol, AudioManager.FLAG_VIBRATE)
                } catch (_: Exception) {}
            }
            Log.d(TAG, "Volume definido ao máximo em todos os streams (sirene evacuação)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao definir volume máximo", e)
        }
    }

    private fun requestAudioFocus(): Boolean {
        return try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(false)
                    .build()
                am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            }
        } catch (e: Exception) {
            Log.w(TAG, "Audio focus não concedido: ${e.message}")
            true
        }
    }

    private fun applyVolumeRestriction() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(this, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.addUserRestriction(admin, UserManager.DISALLOW_ADJUST_VOLUME)
                volumeRestrictionApplied = true
                Log.d(TAG, "Restrição de volume aplicada")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao aplicar restrição de volume", e)
        }
    }

    private fun removeVolumeRestriction() {
        if (!volumeRestrictionApplied) return
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(this, DeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_ADJUST_VOLUME)
                volumeRestrictionApplied = false
                Log.d(TAG, "Restrição de volume removida")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao remover restrição de volume", e)
        }
    }

    private fun startAlarmSound() {
        stopAlarmSound()
        setAlarmVolumeToMax()
        requestAudioFocus()
        try {
            startSiren()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar sirene: ${e.message}", e)
        }
    }

    /**
     * Sirene única normalizada - som wailing (sobe e desce) em volume máximo.
     * Frequência varre de 800Hz a 1600Hz e volta, ciclo ~2 segundos.
     * Mesmo som em todos os dispositivos (gerado por software).
     */
    private fun startSiren() {
        val sampleRate = 44100
        val cycleDurationSec = 2.0
        val freqLow = 800.0
        val freqHigh = 1600.0
        val cycleSamples = (sampleRate * cycleDurationSec).toInt()
        val buffer = ShortArray(cycleSamples)
        var phase = 0.0

        for (i in 0 until cycleSamples) {
            val t = i.toDouble() / sampleRate
            val progress = (t % 1.0)
            val halfCycle = (t / 1.0).toInt() % 2
            val freq = if (halfCycle == 0) {
                freqLow + (freqHigh - freqLow) * progress
            } else {
                freqHigh - (freqHigh - freqLow) * progress
            }
            phase += 2.0 * Math.PI * freq / sampleRate
            val sample = (Math.sin(phase) * 32767).toInt().coerceIn(-32768, 32767)
            buffer[i] = sample.toShort()
        }

        val flags = AudioAttributes.FLAG_AUDIBILITY_ENFORCED or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) 0x40 else 0) // FLAG_BYPASS_INTERRUPTION_POLICY
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setFlags(flags)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        val minSize = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val bufferSize = maxOf(cycleSamples * 2, minSize * 2)

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(audioAttrs)
            .setAudioFormat(format)
            .setBufferSizeInBytes(bufferSize)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
            .apply {
                setVolume(1.0f)
                write(buffer, 0, buffer.size)
                setLoopPoints(0, buffer.size, -1)
                play()
            }
        sendBroadcast(Intent("com.mdm.launcher.ALARM_STARTED").setPackage(packageName))
        Log.d(TAG, "Sirene normalizada iniciada (volume máximo)")
    }

    private fun stopAlarmSound() {
        try {
            audioTrack?.apply {
                if (playState == AudioTrack.PLAYSTATE_PLAYING) stop()
                release()
            }
            audioTrack = null
            Log.d(TAG, "Alarme parado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar alarme", e)
        }
    }
}
