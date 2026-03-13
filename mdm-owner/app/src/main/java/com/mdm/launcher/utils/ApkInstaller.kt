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
            val isDeviceOwner = dpm.isDeviceOwnerApp(context.packageName)

            if (!isDeviceOwner) {
                Log.w(TAG, "App não é Device Owner - usando instalação manual (intent)")
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

            Log.d(TAG, "APK baixado: ${tempFile!!.absolutePath} (${tempFile!!.length()} bytes)")
            onProgress?.invoke(80)

            // Verificar se o APK baixado é válido e obter info do pacote
            val apkInfo = context.packageManager.getPackageArchiveInfo(tempFile!!.absolutePath, 0)
            if (apkInfo == null) {
                val error = "Arquivo baixado não é um APK válido (pode ser uma página de erro HTML)"
                Log.e(TAG, error)
                showToast(context, error)
                onComplete?.invoke(false, error)
                try { tempFile?.delete() } catch (_: Exception) {}
                return@withContext
            }
            Log.d(TAG, "APK válido: ${apkInfo.packageName} v${apkInfo.versionName} (code: ${apkInfo.longVersionCode})")

            // Se é o próprio app MDM, verificar se a assinatura é compatível
            if (apkInfo.packageName == context.packageName) {
                Log.d(TAG, "Auto-atualização detectada: atualizando ${context.packageName}")
                try {
                    val currentSigs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        context.packageManager.getPackageInfo(context.packageName, android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES)
                            .signingInfo?.apkContentsSigners?.map { it.toByteArray().contentHashCode() } ?: emptyList()
                    } else {
                        @Suppress("DEPRECATION")
                        context.packageManager.getPackageInfo(context.packageName, android.content.pm.PackageManager.GET_SIGNATURES)
                            .signatures?.map { it.toByteArray().contentHashCode() } ?: emptyList()
                    }

                    val newPkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        context.packageManager.getPackageArchiveInfo(tempFile!!.absolutePath, android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES)
                    } else {
                        @Suppress("DEPRECATION")
                        context.packageManager.getPackageArchiveInfo(tempFile!!.absolutePath, android.content.pm.PackageManager.GET_SIGNATURES)
                    }

                    val newSigs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        newPkgInfo?.signingInfo?.apkContentsSigners?.map { it.toByteArray().contentHashCode() } ?: emptyList()
                    } else {
                        @Suppress("DEPRECATION")
                        newPkgInfo?.signatures?.map { it.toByteArray().contentHashCode() } ?: emptyList()
                    }

                    if (currentSigs.isNotEmpty() && newSigs.isNotEmpty() && currentSigs != newSigs) {
                        val error = "Assinatura do APK diferente da versão instalada. Recompile o APK com a mesma keystore (debug/release) usada na instalação original."
                        Log.e(TAG, error)
                        showToast(context, error)
                        onComplete?.invoke(false, error)
                        try { tempFile?.delete() } catch (_: Exception) {}
                        return@withContext
                    }
                    Log.d(TAG, "Assinaturas compatíveis, prosseguindo com auto-atualização")
                } catch (e: Exception) {
                    Log.w(TAG, "Não foi possível verificar assinatura, tentando instalar mesmo assim: ${e.message}")
                }
            }

            onProgress?.invoke(85)

            if (isDeviceOwner) {
                // Instalação silenciosa via Device Owner
                val installError = installApk(context, tempFile!!, dpm, componentName)
                if (installError == null) {
                    onProgress?.invoke(100)
                    Log.d(TAG, "APK enviado ao PackageInstaller com sucesso!")
                    showToast(context, "Instalação em andamento...")
                    onComplete?.invoke(true, null)
                    kotlinx.coroutines.delay(60000)
                    try { tempFile?.delete() } catch (_: Exception) {}
                } else {
                    Log.e(TAG, installError)
                    showToast(context, installError)
                    onComplete?.invoke(false, installError)
                    try { tempFile?.delete() } catch (_: Exception) {}
                }
            } else {
                // Instalação manual via intent (sem Device Owner)
                try {
                    val apkUri = androidx.core.content.FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.provider",
                        tempFile!!
                    )
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(apkUri, "application/vnd.android.package-archive")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }
                    context.startActivity(intent)
                    onProgress?.invoke(100)
                    Log.d(TAG, "Intent de instalação manual aberto")
                    showToast(context, "Abrindo instalador...")
                    onComplete?.invoke(true, null)
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao abrir instalador manual: ${e.message}", e)
                    showToast(context, "Erro ao abrir instalador: ${e.message}")
                    onComplete?.invoke(false, e.message)
                    try { tempFile?.delete() } catch (_: Exception) {}
                }
            }

        } catch (e: Exception) {
            val error = "Erro ao instalar APK: ${e.message}"
            Log.e(TAG, error, e)
            showToast(context, error)
            onComplete?.invoke(false, error)
            try { tempFile?.delete() } catch (_: Exception) {}
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

    /**
     * @return null se sucesso (commit feito), ou mensagem de erro
     */
    private fun installApk(
        context: Context,
        apkFile: File,
        dpm: DevicePolicyManager,
        componentName: ComponentName
    ): String? {
        return try {
            Log.d(TAG, "Instalando APK via Device Owner: ${apkFile.absolutePath} (${apkFile.length()} bytes)")

            if (apkFile.length() < 1000) {
                return "APK muito pequeno (${apkFile.length()} bytes) - arquivo possivelmente corrompido"
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val packageInstaller = context.packageManager.packageInstaller

                // Abandonar sessões antigas pendentes para evitar conflitos
                for (info in packageInstaller.mySessions) {
                    try {
                        packageInstaller.abandonSession(info.sessionId)
                        Log.d(TAG, "Sessão antiga abandonada: ${info.sessionId}")
                    } catch (_: Exception) {}
                }

                val sessionParams = PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL
                ).apply {
                    setSize(apkFile.length())
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        setInstallReason(android.content.pm.PackageManager.INSTALL_REASON_POLICY)
                    }
                }

                val sessionId = packageInstaller.createSession(sessionParams)
                Log.d(TAG, "Sessão criada (ID: $sessionId)")
                val session = packageInstaller.openSession(sessionId)

                // Copiar APK para a sessão
                FileInputStream(apkFile).use { inputStream ->
                    session.openWrite("package", 0, apkFile.length()).use { outputStream ->
                        inputStream.copyTo(outputStream, 65536)
                        session.fsync(outputStream)
                    }
                }
                Log.d(TAG, "APK copiado para sessão")

                // Usar AppUpdateReceiver para receber resultado real
                val intent = Intent(context, AppUpdateReceiver::class.java)
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )

                session.commit(pendingIntent.intentSender)
                // Não chamar session.close() após commit - o sistema gerencia a sessão

                Log.d(TAG, "Sessão de instalação commitada (ID: $sessionId), aguardando resultado...")
                // Aguardar para o PackageInstaller processar
                Thread.sleep(5000)
                null // sucesso

            } else {
                val apkUri = Uri.fromFile(apkFile)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                }
                context.startActivity(intent)
                null // sucesso
            }

        } catch (e: Exception) {
            Log.e(TAG, "Erro ao instalar APK: ${e.message}", e)
            "Erro na instalação: ${e.message}"
        }
    }
}
