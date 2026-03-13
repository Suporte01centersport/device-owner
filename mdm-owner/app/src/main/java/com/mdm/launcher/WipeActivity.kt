package com.mdm.launcher

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Activity que recebe deep link mdmcenter://wipe?token=XXX&ts=TIMESTAMP
 * e executa factory reset IMEDIATO sem confirmação.
 *
 * O token é um HMAC-SHA256 do timestamp, validado localmente com a chave do servidor.
 */
class WipeActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "WipeActivity"
        private const val WIPE_SECRET = "MDM_CENTER_WIPE_2026"
        private const val TOKEN_VALIDITY_MS = 24 * 60 * 60 * 1000L // 24 horas
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

        val token = uri.getQueryParameter("token") ?: ""
        val tsStr = uri.getQueryParameter("ts") ?: "0"
        val ts = tsStr.toLongOrNull() ?: 0L

        // Validar tempo (token expira em 24h)
        val now = System.currentTimeMillis()
        if (Math.abs(now - ts) > TOKEN_VALIDITY_MS) {
            Log.e(TAG, "Token expirado (ts=$ts, now=$now)")
            finish()
            return
        }

        // Validar HMAC
        val expectedToken = computeHmac(tsStr)
        if (token != expectedToken) {
            Log.e(TAG, "Token inválido")
            finish()
            return
        }

        Log.w(TAG, "Token VÁLIDO - executando factory reset IMEDIATO")
        executeWipe()
    }

    private fun computeHmac(data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(WIPE_SECRET.toByteArray(), "HmacSHA256"))
        val hash = mac.doFinal(data.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun executeWipe() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (dpm.isDeviceOwnerApp(packageName)) {
                Log.w(TAG, "FACTORY RESET EXECUTANDO AGORA!")
                dpm.wipeData(0)
            } else {
                Log.e(TAG, "Não é Device Owner - não pode formatar")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao formatar: ${e.message}")
        }
        finish()
    }
}
