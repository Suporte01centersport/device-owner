package com.mdm.launcher.utils

import android.app.DownloadManager
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import java.io.File

/**
 * Gerenciador de atualização automática de APK
 * Usa Device Owner para instalação silenciosa sem interação do usuário
 */
object AppUpdater {
    private const val TAG = "AppUpdater"
    private const val NOTIFICATION_CHANNEL_ID = "app_update_channel"
    internal const val NOTIFICATION_ID = 9999  // Internal para ser acessível pelo AppUpdateReceiver
    private var downloadId: Long = -1
    private var downloadReceiver: BroadcastReceiver? = null
    
    /**
     * Baixa e instala automaticamente um APK de uma URL
     * @param context Context da aplicação
     * @param apkUrl URL do APK (ex: GitHub releases)
     * @param onProgress Callback de progresso (0-100)
     * @param onComplete Callback ao completar (sucesso/erro)
     */
    fun downloadAndInstall(
        context: Context,
        apkUrl: String,
        onProgress: ((Int) -> Unit)? = null,
        onComplete: ((Boolean, String) -> Unit)? = null
    ) {
        Log.d(TAG, "Iniciando atualização: $apkUrl")
        
        // Mostrar notificação de início
        showUpdateNotification(context, "Preparando atualização...", 0)
        
        try {
            // Verificar se é Device Owner
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isDeviceOwner = dpm.isDeviceOwnerApp(context.packageName)
            
            if (!isDeviceOwner) {
                Log.e(TAG, "App não é Device Owner - não pode instalar automaticamente")
                onComplete?.invoke(false, "App não é Device Owner")
                return
            }
            
            // Criar diretório de download se não existir
            val downloadDir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates")
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
            }
            
            // Nome do arquivo
            val fileName = "update_${System.currentTimeMillis()}.apk"
            val destinationFile = File(downloadDir, fileName)
            
            // Configurar DownloadManager
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
                setTitle("Atualização MDM Center")
                setDescription("Baixando nova versão...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                setDestinationUri(Uri.fromFile(destinationFile))
                setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE)
            }
            
            // Iniciar download
            downloadId = downloadManager.enqueue(request)
            Log.d(TAG, "Download iniciado - ID: $downloadId")
            
            // Monitorar progresso
            monitorDownloadProgress(context, downloadManager, downloadId, onProgress)
            
            // Registrar receiver para detectar conclusão do download
            downloadReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                    
                    if (id == downloadId) {
                        Log.d(TAG, "Download concluído")
                        
                        // Desregistrar receiver
                        try {
                            context?.unregisterReceiver(this)
                        } catch (e: Exception) {
                            Log.w(TAG, "Erro ao desregistrar receiver", e)
                        }
                        
                        // Verificar status do download
                        val query = DownloadManager.Query().setFilterById(downloadId)
                        val cursor = downloadManager.query(query)
                        
                        if (cursor.moveToFirst()) {
                            val columnIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                            val status = cursor.getInt(columnIndex)
                            
                            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                                showUpdateNotification(context!!, "Instalando atualização...", 100)
                                installApkSilently(context, destinationFile, onComplete)
                            } else {
                                val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                                val reason = cursor.getInt(reasonIndex)
                                val reasonText = when(reason) {
                                    DownloadManager.ERROR_CANNOT_RESUME -> "Não pode retomar"
                                    DownloadManager.ERROR_DEVICE_NOT_FOUND -> "Dispositivo não encontrado"
                                    DownloadManager.ERROR_FILE_ALREADY_EXISTS -> "Arquivo já existe"
                                    DownloadManager.ERROR_FILE_ERROR -> "Erro no arquivo"
                                    DownloadManager.ERROR_HTTP_DATA_ERROR -> "Erro HTTP de dados"
                                    DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Espaço insuficiente"
                                    DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Muitos redirecionamentos"
                                    DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "Código HTTP não tratado"
                                    DownloadManager.ERROR_UNKNOWN -> "Erro desconhecido"
                                    else -> "Código: $reason"
                                }
                                Log.e(TAG, "❌ Download falhou - Status: $status, Reason: $reason ($reasonText)")
                                showUpdateNotification(context!!, "Download falhou: $reasonText", -1)
                                onComplete?.invoke(false, "Download falhou: $reasonText")
                            }
                        }
                        cursor.close()
                    }
                }
            }
            
            // Registrar receiver
            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                context.registerReceiver(downloadReceiver, filter)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar download", e)
            e.printStackTrace()
            showUpdateNotification(context, "Erro: ${e.message}", -1)
            onComplete?.invoke(false, "Erro: ${e.message}")
        }
    }
    
    /**
     * Monitora progresso do download em tempo real
     */
    private fun monitorDownloadProgress(
        context: Context,
        downloadManager: DownloadManager,
        downloadId: Long,
        onProgress: ((Int) -> Unit)?
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            var isDownloading = true
            
            while (isDownloading) {
                val query = DownloadManager.Query().setFilterById(downloadId)
                val cursor = downloadManager.query(query)
                
                if (cursor.moveToFirst()) {
                    val bytesDownloaded = cursor.getLong(cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    val bytesTotal = cursor.getLong(cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    
                    if (bytesTotal > 0) {
                        val progress = ((bytesDownloaded * 100) / bytesTotal).toInt()
                        onProgress?.invoke(progress)
                        showUpdateNotification(context, "Baixando atualização...", progress)
                    }
                    
                    val status = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_STATUS))
                    if (status == DownloadManager.STATUS_SUCCESSFUL || status == DownloadManager.STATUS_FAILED) {
                        isDownloading = false
                    }
                }
                cursor.close()
                
                delay(500) // Atualizar a cada 500ms
            }
        }
    }
    
    /**
     * Instala APK silenciosamente usando Device Owner
     */
    private fun installApkSilently(
        context: Context,
        apkFile: File,
        onComplete: ((Boolean, String) -> Unit)?
    ) {
        try {
            if (!apkFile.exists()) {
                Log.e(TAG, "Arquivo APK não encontrado")
                onComplete?.invoke(false, "Arquivo não encontrado")
                return
            }
            
            Log.d(TAG, "Instalando APK: ${apkFile.name}")
            
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            
            // Device Owner pode instalar APKs silenciosamente sem prompt
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // Usar PackageInstaller com Device Owner
                val packageInstaller = context.packageManager.packageInstaller
                val params = android.content.pm.PackageInstaller.SessionParams(
                    android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
                )
                
                val sessionId = packageInstaller.createSession(params)
                val session = packageInstaller.openSession(sessionId)
                
                // Copiar APK para a sessão
                apkFile.inputStream().use { input ->
                    session.openWrite("package", 0, -1).use { output ->
                        input.copyTo(output)
                        session.fsync(output)
                    }
                }
                
                // Criar intent de callback
                val intent = Intent(context, AppUpdateReceiver::class.java)
                val pendingIntent = android.app.PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
                )
                
                session.commit(pendingIntent.intentSender)
                session.close()
                
                Log.d(TAG, "Instalação iniciada - Session ID: $sessionId")
                onComplete?.invoke(true, "Instalação em andamento")
                
            } else {
                Log.e(TAG, "❌ API Level muito antigo - requer Android 5.0+")
                onComplete?.invoke(false, "Android 5.0+ necessário")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao instalar APK", e)
            onComplete?.invoke(false, "Erro na instalação: ${e.message}")
        }
    }
    
    /**
     * Mostra notificação de atualização com progresso
     */
    private fun showUpdateNotification(context: Context, message: String, progress: Int) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            
            // Criar canal de notificação (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = android.app.NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Atualizações do App",
                    android.app.NotificationManager.IMPORTANCE_HIGH
                )
                channel.description = "Notificações de atualização do aplicativo"
                notificationManager.createNotificationChannel(channel)
            }
            
            // Criar notificação
            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.app.Notification.Builder(context, NOTIFICATION_CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                android.app.Notification.Builder(context)
            }
            
            builder.setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("📥 Atualizando MDM Center")
                .setContentText(message)
                .setOngoing(true)
                .setAutoCancel(false)
            
            // Adicionar barra de progresso se houver
            if (progress > 0) {
                builder.setProgress(100, progress, false)
            } else {
                builder.setProgress(100, 0, true) // Indeterminado
            }
            
            notificationManager.notify(NOTIFICATION_ID, builder.build())
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao mostrar notificação", e)
        }
    }
    
    /**
     * Remove notificação de atualização
     */
    private fun hideUpdateNotification(context: Context) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            notificationManager.cancel(NOTIFICATION_ID)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao remover notificação", e)
        }
    }
    
    /**
     * Cancela download em andamento
     */
    fun cancelDownload(context: Context) {
        if (downloadId != -1L) {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadManager.remove(downloadId)
            Log.d(TAG, "Download cancelado")
            downloadId = -1
        }
        
        downloadReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Erro ao desregistrar receiver", e)
            }
            downloadReceiver = null
        }
    }
}

/**
 * Receiver para resultado da instalação
 */
class AppUpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val status = intent?.getIntExtra(android.content.pm.PackageInstaller.EXTRA_STATUS, -1)
        
        when (status) {
            android.content.pm.PackageInstaller.STATUS_SUCCESS -> {
                Log.d("AppUpdateReceiver", "Instalação concluída com sucesso")
                
                // Remover notificação de progresso
                context?.let {
                    val notificationManager = it.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                    notificationManager.cancel(AppUpdater.NOTIFICATION_ID)
                }
                
                // Notificar servidor sobre sucesso
                notifyServerUpdateSuccess(context)
            }
            android.content.pm.PackageInstaller.STATUS_FAILURE,
            android.content.pm.PackageInstaller.STATUS_FAILURE_ABORTED,
            android.content.pm.PackageInstaller.STATUS_FAILURE_BLOCKED,
            android.content.pm.PackageInstaller.STATUS_FAILURE_CONFLICT,
            android.content.pm.PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
            android.content.pm.PackageInstaller.STATUS_FAILURE_INVALID,
            android.content.pm.PackageInstaller.STATUS_FAILURE_STORAGE -> {
                val message = intent?.getStringExtra(android.content.pm.PackageInstaller.EXTRA_STATUS_MESSAGE)
                Log.e("AppUpdateReceiver", "❌ Instalação falhou: $message (Status: $status)")
                
                // Notificar servidor sobre falha
                notifyServerUpdateFailure(context, message ?: "Erro desconhecido")
            }
            android.content.pm.PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                Log.w("AppUpdateReceiver", "⚠️ Ação do usuário necessária (não deveria acontecer em Device Owner)")
            }
        }
    }
    
    private fun notifyServerUpdateSuccess(context: Context?) {
        context?.let {
            val intent = Intent("com.mdm.launcher.UPDATE_SUCCESS")
            intent.setPackage(it.packageName)
            it.sendBroadcast(intent)
        }
    }
    
    private fun notifyServerUpdateFailure(context: Context?, message: String) {
        context?.let {
            val intent = Intent("com.mdm.launcher.UPDATE_FAILURE")
            intent.setPackage(it.packageName)
            intent.putExtra("error_message", message)
            it.sendBroadcast(intent)
        }
    }
}

