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
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
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

    private var mediaPlayer: MediaPlayer? = null
    private var audioTrack: AudioTrack? = null
    private var toneGenerator: ToneGenerator? = null
    private var toneRunnable: Runnable? = null
    private val handler = Handler(Looper.getMainLooper())
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
                startAlarmSound()
            }
            "STOP" -> {
                stopAlarmSound()
                removeVolumeRestriction()
                stopForeground(true)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopAlarmSound()
        removeVolumeRestriction()
        super.onDestroy()
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
        try {
            startPoliceSiren()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar sirene", e)
            startToneGeneratorFallback()
        }
    }

    /**
     * Buzzer alarme irritante - onda quadrada alta frequência, pulsos rápidos.
     * Som que incomoda de verdade para desencorajar ações não autorizadas.
     */
    private fun startPoliceSiren() {
        val sampleRate = 44100
        val freq = 3200f  // Hz - frequência alta e irritante
        val beepOnMs = 80   // ms de som
        val beepOffMs = 80  // ms de silêncio
        val cycleSamples = (sampleRate * (beepOnMs + beepOffMs) / 1000).toInt()
        val buffer = ShortArray(cycleSamples)
        val onSamples = (sampleRate * beepOnMs / 1000).toInt()
        var phase = 0.0

        for (i in 0 until cycleSamples) {
            val sample = if (i < onSamples) {
                phase += 2.0 * Math.PI * freq / sampleRate
                val square = if (Math.sin(phase) > 0) 1.0 else -1.0
                (square * 32767 * 0.9).toInt().coerceIn(-32768, 32767)
            } else {
                0
            }
            buffer[i] = sample.toShort()
        }

        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
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
                write(buffer, 0, buffer.size)
                setLoopPoints(0, buffer.size, -1)
                play()
            }
        sendBroadcast(Intent("com.mdm.launcher.ALARM_STARTED").setPackage(packageName))
        Log.d(TAG, "Buzzer alarme iniciado")
    }

    private fun startToneGeneratorFallback() {
        try {
            toneGenerator = ToneGenerator(AudioManager.STREAM_ALARM, 100)
            toneRunnable = object : Runnable {
                override fun run() {
                    toneGenerator?.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 400)
                    handler.postDelayed(this, 500)
                }
            }
            handler.post(toneRunnable!!)
            sendBroadcast(Intent("com.mdm.launcher.ALARM_STARTED").setPackage(packageName))
            Log.d(TAG, "Buzzer alarme iniciado (fallback)")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar ToneGenerator", e)
        }
    }

    private fun stopAlarmSound() {
        try {
            toneRunnable?.let { handler.removeCallbacks(it) }
            toneRunnable = null
            toneGenerator?.release()
            toneGenerator = null
            audioTrack?.apply {
                if (playState == AudioTrack.PLAYSTATE_PLAYING) stop()
                release()
            }
            audioTrack = null
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null
            Log.d(TAG, "Alarme parado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar alarme", e)
        }
    }
}
