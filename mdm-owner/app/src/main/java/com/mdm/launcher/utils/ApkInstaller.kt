package com.mdm.launcher.utils

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.mdm.launcher.DeviceAdminReceiver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

object ApkInstaller {

    private const val TAG = "ApkInstaller"
    private const val MAX_RETRIES = 3
    private const val CONNECT_TIMEOUT = 60L
    private const val READ_TIMEOUT = 120L
    private const val USER_AGENT = "MDM-Launcher/1.0 (Android)"

    private val okHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT, TimeUnit.SECONDS)
            .writeTimeout(READ_TIMEOUT, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .build()
    }

    private fun showToast(context: Context, message: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context.applicationContext, message, Toast.LENGTH_LONG).show()
        }
    }

    /**
     * @param apkUrl URL principal do APK (do painel)
     * @param fallbackUrls URLs alternativas (ex: do servidor conectado) - tentadas em ordem se a principal falhar
     */
    suspend fun installApkFromUrl(
        context: Context,
        apkUrl: String,
        version: String? = null,
        fallbackUrls: List<String>? = null,
        onProgress: ((Int) -> Unit)? = null,
        onComplete: ((Boolean, String?) -> Unit)? = null
    ) = withContext(Dispatchers.IO) {
        var tempFile: File? = null
        try {
            val urlsToTry = listOfNotNull(apkUrl) + (fallbackUrls ?: emptyList()).filter { it != apkUrl }
            Log.d(TAG, "Iniciando instalação de APK. URLs a tentar: $urlsToTry")

            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)

            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                val error = "App não é Device Owner. Instalação silenciosa requer Device Owner."
                Log.e(TAG, error)
                showToast(context, error)
                onComplete?.invoke(false, error)
                return@withContext
            }

            onProgress?.invoke(10)
            tempFile = downloadApkWithRetry(context, urlsToTry) { progress ->
                val totalProgress = 10 + (progress * 0.7).toInt()
                onProgress?.invoke(totalProgress)
            }

            if (tempFile == null || !tempFile!!.exists()) {
                val error = "Falha ao baixar APK. Verifique se o celular está na mesma rede do servidor."
                Log.e(TAG, error)
                showToast(context, error)
                onComplete?.invoke(false, error)
                return@withContext
            }

            Log.d(TAG, "APK baixado: ${tempFile!!.absolutePath}")
            onProgress?.invoke(80)

            onProgress?.invoke(85)
            val installSuccess = installApk(context, tempFile!!, dpm, componentName)
            onProgress?.invoke(100)

            if (installSuccess) {
                Log.d(TAG, "APK instalado com sucesso!")
                showToast(context, "Instalação concluída")
                onComplete?.invoke(true, null)
            } else {
                val error = "Falha ao instalar APK"
                Log.e(TAG, error)
                showToast(context, error)
                onComplete?.invoke(false, error)
            }

        } catch (e: Exception) {
            val error = "Erro ao instalar APK: ${e.message}"
            Log.e(TAG, error, e)
            showToast(context, error)
            onComplete?.invoke(false, error)
        } finally {
            try {
                tempFile?.delete()
            } catch (e: Exception) {
                Log.w(TAG, "Erro ao remover arquivo temporário: ${e.message}")
            }
        }
    }

    private suspend fun downloadApkWithRetry(
        context: Context,
        urlsToTry: List<String>,
        onProgress: ((Int) -> Unit)? = null
    ): File? = withContext(Dispatchers.IO) {
        var lastError: Exception? = null
        for (url in urlsToTry) {
            repeat(MAX_RETRIES) { attempt ->
                try {
                    Log.d(TAG, "Tentativa ${attempt + 1}/$MAX_RETRIES - URL: $url")
                    val result = downloadApk(context, url, onProgress)
                    if (result != null) {
                        Log.d(TAG, "Download concluído com sucesso de: $url")
                        return@withContext result
                    }
                } catch (e: Exception) {
                    lastError = e
                    Log.w(TAG, "Tentativa ${attempt + 1} falhou ($url): ${e.message}")
                    if (attempt < MAX_RETRIES - 1) {
                        kotlinx.coroutines.delay(2000L * (attempt + 1))
                    }
                }
            }
        }
        lastError?.let { Log.e(TAG, "Todas as URLs falharam", it) }
        null
    }

    private fun downloadApk(
        context: Context,
        apkUrl: String,
        onProgress: ((Int) -> Unit)? = null
    ): File? {
        val request = Request.Builder()
            .url(apkUrl)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "*/*")
            .get()
            .build()

        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                Log.e(TAG, "Erro HTTP: ${response.code} ${response.message}")
                return null
            }

            val body = response.body ?: return null
            val contentLength = body.contentLength()
            val tempDir = context.getExternalFilesDir(null) ?: context.cacheDir
            val tempFile = File(tempDir, "downloaded_apk_${System.currentTimeMillis()}.apk")

            body.byteStream().use { inputStream ->
                FileOutputStream(tempFile).use { outputStream ->
                    val buffer = ByteArray(65536)
                    var totalBytesRead = 0L
                    var bytesRead: Int

                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        outputStream.write(buffer, 0, bytesRead)
                        totalBytesRead += bytesRead

                        if (contentLength > 0 && onProgress != null) {
                            val progress = ((totalBytesRead * 100) / contentLength).toInt().coerceIn(0, 100)
                            onProgress(progress)
                        }
                    }
                    outputStream.flush()
                }
            }

            if (tempFile.length() == 0L) {
                Log.e(TAG, "Arquivo baixado está vazio")
                tempFile.delete()
                return null
            }

            return tempFile
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
}
