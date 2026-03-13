package com.mdm.launcher

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.File

/**
 * Activity que recebe deep link mdmcenter://download?server=IP:PORT
 * e baixa o APK do servidor MDM diretamente, sem precisar do Chrome.
 *
 * Fluxo: Camera lê QR → deep link abre esta Activity → baixa APK → instala
 */
class DownloadActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "DownloadActivity"
    }

    private var downloadId: Long = -1

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
            if (id == downloadId) {
                Log.d(TAG, "Download concluído, iniciando instalação")
                installDownloadedApk()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri = intent?.data
        if (uri == null) {
            Log.e(TAG, "Sem URI - finalizando")
            finish()
            return
        }

        Log.d(TAG, "Deep link recebido: $uri")

        val server = uri.getQueryParameter("server") ?: ""
        if (server.isEmpty()) {
            Log.e(TAG, "Parâmetro 'server' não encontrado")
            Toast.makeText(this, "Erro: servidor não especificado", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val apkUrl = "http://$server/apk/mdm.apk"
        Log.d(TAG, "Baixando APK de: $apkUrl")
        Toast.makeText(this, "Baixando MDM...", Toast.LENGTH_SHORT).show()

        // Registrar receiver para saber quando download terminar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), RECEIVER_EXPORTED)
        } else {
            registerReceiver(downloadReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        }

        // Iniciar download
        startDownload(apkUrl)
    }

    private fun startDownload(apkUrl: String) {
        try {
            // Deletar APK antigo se existir
            val oldFile = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "mdm-launcher.apk")
            if (oldFile.exists()) oldFile.delete()

            val request = DownloadManager.Request(Uri.parse(apkUrl))
                .setTitle("MDM Launcher")
                .setDescription("Baixando atualização...")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "mdm-launcher.apk")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadId = dm.enqueue(request)
            Log.d(TAG, "Download iniciado com ID: $downloadId")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar download: ${e.message}")
            Toast.makeText(this, "Erro ao baixar: ${e.message}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun installDownloadedApk() {
        try {
            val file = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "mdm-launcher.apk")
            if (!file.exists()) {
                Log.e(TAG, "APK não encontrado após download")
                Toast.makeText(this, "Erro: APK não encontrado", Toast.LENGTH_LONG).show()
                finish()
                return
            }

            Log.d(TAG, "Instalando APK: ${file.absolutePath} (${file.length()} bytes)")

            // Tentar instalar silenciosamente como Device Owner
            try {
                val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                if (dpm.isDeviceOwnerApp(packageName)) {
                    val installer = packageManager.packageInstaller
                    val params = android.content.pm.PackageInstaller.SessionParams(
                        android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
                    )
                    val sessionId = installer.createSession(params)
                    val session = installer.openSession(sessionId)

                    file.inputStream().use { input ->
                        session.openWrite("mdm-launcher.apk", 0, file.length()).use { output ->
                            input.copyTo(output)
                            session.fsync(output)
                        }
                    }

                    val intent = Intent(this, com.mdm.launcher.utils.AppUpdateReceiver::class.java)
                    val pendingIntent = android.app.PendingIntent.getBroadcast(
                        this, sessionId, intent,
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                    )
                    session.commit(pendingIntent.intentSender)
                    Log.d(TAG, "Instalação silenciosa iniciada")
                    Toast.makeText(this, "Instalando MDM...", Toast.LENGTH_SHORT).show()
                    finish()
                    return
                }
            } catch (e: Exception) {
                Log.e(TAG, "Instalação silenciosa falhou, tentando manual: ${e.message}")
            }

            // Fallback: instalação via intent com URI do arquivo
            val apkUri = Uri.fromFile(file)
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(installIntent)
            Toast.makeText(this, "Instale o APK", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Log.e(TAG, "Erro na instalação: ${e.message}")
            Toast.makeText(this, "Erro ao instalar: ${e.message}", Toast.LENGTH_LONG).show()
        }
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(downloadReceiver)
        } catch (_: Exception) {}
    }
}
