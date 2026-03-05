package com.mdm.launcher.utils

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.util.Log
import com.mdm.launcher.MainActivity
import com.mdm.launcher.R
import com.mdm.launcher.DeviceAdminReceiver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object ApkInstaller {

    private const val TAG = "ApkInstaller"
    private const val NOTIFICATION_CHANNEL_ID = "apk_installer_channel"
    private const val NOTIFICATION_ID_DOWNLOAD = 2001
    private const val NOTIFICATION_ID_INSTALL = 2002

    suspend fun installApkFromUrl(
        context: Context,
        apkUrl: String,
        version: String? = null,
        onProgress: ((Int) -> Unit)? = null,
        onComplete: ((Boolean, String?) -> Unit)? = null
    ) = withContext(Dispatchers.IO) {
        var tempFile: File? = null
        try {
            Log.d(TAG, "Iniciando instalação de APK: $apkUrl")

            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)

            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                val error = "App não é Device Owner. Instalação silenciosa requer Device Owner."
                Log.e(TAG, error)
                showNotification(context, "Erro na Instalação", error, false)
                onComplete?.invoke(false, error)
                return@withContext
            }

            createNotificationChannel(context)

            showNotification(
                context,
                "Download do APK",
                "Baixando APK...",
                true,
                NOTIFICATION_ID_DOWNLOAD
            )

            onProgress?.invoke(10)
            tempFile = downloadApk(context, apkUrl) { progress ->
                val totalProgress = 10 + (progress * 0.7).toInt()
                onProgress?.invoke(totalProgress)
            }

            if (tempFile == null || !tempFile!!.exists()) {
                val error = "Falha ao baixar APK"
                Log.e(TAG, error)
                showNotification(context, "Erro no Download", error, false)
                onComplete?.invoke(false, error)
                return@withContext
            }

            Log.d(TAG, "APK baixado: ${tempFile!!.absolutePath}")
            onProgress?.invoke(80)

            showNotification(
                context,
                "Instalando APK",
                "Instalando aplicativo...",
                true,
                NOTIFICATION_ID_INSTALL
            )

            onProgress?.invoke(85)
            val installSuccess = installApk(context, tempFile!!, dpm, componentName)
            onProgress?.invoke(100)

            if (installSuccess) {
                Log.d(TAG, "APK instalado com sucesso!")
                showNotification(
                    context,
                    "Instalação Concluída",
                    "APK instalado com sucesso!",
                    false
                )
                onComplete?.invoke(true, null)
            } else {
                val error = "Falha ao instalar APK"
                Log.e(TAG, error)
                showNotification(context, "Erro na Instalação", error, false)
                onComplete?.invoke(false, error)
            }

        } catch (e: Exception) {
            val error = "Erro ao instalar APK: ${e.message}"
            Log.e(TAG, error, e)
            showNotification(context, "Erro", error, false)
            onComplete?.invoke(false, error)
        } finally {
            try {
                tempFile?.delete()
            } catch (e: Exception) {
                Log.w(TAG, "Erro ao remover arquivo temporário: ${e.message}")
            }
        }
    }

    private suspend fun downloadApk(
        context: Context,
        apkUrl: String,
        onProgress: ((Int) -> Unit)? = null
    ): File? = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        var outputStream: FileOutputStream? = null
        var inputStream: java.io.InputStream? = null

        try {
            val url = URL(apkUrl)
            connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 30000
            connection.readTimeout = 60000
            connection.connect()

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                Log.e(TAG, "Erro HTTP: ${connection.responseCode}")
                return@withContext null
            }

            val contentLength = connection.contentLength
            val tempDir = context.getExternalFilesDir(null) ?: context.cacheDir
            val tempFile = File(tempDir, "downloaded_apk_${System.currentTimeMillis()}.apk")

            inputStream = connection.inputStream
            outputStream = FileOutputStream(tempFile)

            val buffer = ByteArray(8192)
            var totalBytesRead = 0L
            var bytesRead: Int

            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                outputStream.write(buffer, 0, bytesRead)
                totalBytesRead += bytesRead

                if (contentLength > 0 && onProgress != null) {
                    val progress = ((totalBytesRead * 100) / contentLength).toInt()
                    onProgress(progress)
                }
            }

            outputStream.flush()
            return@withContext tempFile

        } catch (e: Exception) {
            Log.e(TAG, "Erro ao fazer download: ${e.message}", e)
            return@withContext null
        } finally {
            try {
                inputStream?.close()
                outputStream?.close()
                connection?.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Erro ao fechar streams: ${e.message}")
            }
        }
    }

    private fun installApk(
        context: Context,
        apkFile: File,
        dpm: DevicePolicyManager,
        componentName: ComponentName
    ): Boolean {
        return try {
            Log.d(TAG, "Instalando APK via Device Owner: ${apkFile.absolutePath}")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val packageInstaller = context.packageManager.packageInstaller

                val sessionParams = PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL
                )

                val sessionId = packageInstaller.createSession(sessionParams)
                val session = packageInstaller.openSession(sessionId)

                val apkSize = apkFile.length()
                val inputStream = FileInputStream(apkFile)
                val outputStream = session.openWrite("apk", 0, apkSize)

                val buffer = ByteArray(65536)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }

                session.fsync(outputStream)
                inputStream.close()
                outputStream.close()

                val intent = Intent("com.mdm.launcher.INSTALL_COMPLETE").apply {
                    setPackage(context.packageName)
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    0,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                session.commit(pendingIntent.intentSender)
                session.close()

                Log.d(TAG, "Sessão de instalação criada (ID: $sessionId)")
                Thread.sleep(3000)
                true

            } else {
                val apkUri = Uri.fromFile(apkFile)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                }
                context.startActivity(intent)
                true
            }

        } catch (e: Exception) {
            Log.e(TAG, "Erro ao instalar APK: ${e.message}", e)
            false
        }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Instalação de APK",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações sobre download e instalação de APKs"
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification(
        context: Context,
        title: String,
        message: String,
        ongoing: Boolean,
        notificationId: Int = NOTIFICATION_ID_INSTALL
    ) {
        try {
            val intent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(context, NOTIFICATION_CHANNEL_ID)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setSmallIcon(R.drawable.ic_service_notification)
                    .setContentIntent(pendingIntent)
                    .setOngoing(ongoing)
                    .setAutoCancel(!ongoing)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(context)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setSmallIcon(R.drawable.ic_service_notification)
                    .setContentIntent(pendingIntent)
                    .setOngoing(ongoing)
                    .setAutoCancel(!ongoing)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .build()
            }

            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(notificationId, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao mostrar notificação: ${e.message}")
        }
    }
}
