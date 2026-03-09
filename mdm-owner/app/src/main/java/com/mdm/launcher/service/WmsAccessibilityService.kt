package com.mdm.launcher.service

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Captura erros HTTP/HTTPS que aparecem na UI do WMS (diálogos, toasts, textos de erro).
 * Complementa o MdmNotificationListenerService (que captura notificações do sistema).
 * Envia broadcast WMS_ERROR para WebSocketService → mensagem de suporte no painel web.
 */
class WmsAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "WmsAccessibility"
        private const val WMS_PACKAGE = "com.centersporti.wmsmobile"
        private const val DEBOUNCE_MS = 5000L // Evita enviar o mesmo erro repetido

        /** Padrões de texto que indicam erros HTTP/HTTPS ou de rede */
        private val ERROR_PATTERNS = listOf(
            Regex("""HTTP[S]?\s*(error|erro|status|code)?\s*[45]\d{2}""", RegexOption.IGNORE_CASE),
            Regex("""(status|code|erro|error)[:\s]+[45]\d{2}""", RegexOption.IGNORE_CASE),
            Regex("""\b[45]\d{2}\b.{0,30}(error|erro|falha|fail|bad|not found|server|unauthorized|forbidden|timeout)""", RegexOption.IGNORE_CASE),
            Regex("""(error|erro|falha|fail).{0,30}\b[45]\d{2}\b""", RegexOption.IGNORE_CASE),
            Regex("""(connection|conexão).*(refused|recusad|timeout|expirou|failed|falhou)""", RegexOption.IGNORE_CASE),
            Regex("""(timeout|time.out|tempo.esgotado|request.*timeout)""", RegexOption.IGNORE_CASE),
            Regex("""(ssl|tls).*(error|erro|failed|falhou|certificate|certificado|handshake)""", RegexOption.IGNORE_CASE),
            Regex("""(certificate|certificado).*(invalid|inválido|expired|expirado|error|erro)""", RegexOption.IGNORE_CASE),
            Regex("""(network|rede).*(error|erro|unavailable|indisponível|failed|falhou)""", RegexOption.IGNORE_CASE),
            Regex("""(server|servidor).*(error|erro|unavailable|indisponível|offline|unreachable)""", RegexOption.IGNORE_CASE),
            Regex("""(javax\.net|java\.net|okhttp|retrofit)\..*(exception|error)""", RegexOption.IGNORE_CASE),
            Regex("""(socket|soquete).*(exception|error|timeout|closed|fechado)""", RegexOption.IGNORE_CASE),
            Regex("""erro\s+(ao|de)\s+(conectar|carregar|buscar|sincronizar|comunicar)""", RegexOption.IGNORE_CASE),
            Regex("""(failed to|falha ao)\s+(connect|load|fetch|sync|communicate)""", RegexOption.IGNORE_CASE),
        )
    }

    private var lastSentError = ""
    private var lastSentTime = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.packageName?.toString() != WMS_PACKAGE) return

        val errorText = when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                val root = rootInActiveWindow ?: return
                extractErrorText(root)
            }
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> {
                event.text?.joinToString(" ")?.takeIf { it.isNotBlank() }
                    ?.let { findHttpError(it) }
            }
            else -> null
        } ?: return

        sendErrorIfNew(errorText)
    }

    /** Percorre a árvore de views do WMS procurando textos com padrões de erro HTTP/HTTPS */
    private fun extractErrorText(node: AccessibilityNodeInfo): String? {
        // Coletar todos os textos visíveis
        val texts = mutableListOf<String>()
        collectTexts(node, texts, depth = 0)

        // Unir textos e procurar padrão de erro
        val combined = texts.joinToString(" ")
        return findHttpError(combined)
    }

    private fun collectTexts(node: AccessibilityNodeInfo, texts: MutableList<String>, depth: Int) {
        if (depth > 8) return // Limite de profundidade para performance
        try {
            node.text?.toString()?.takeIf { it.isNotBlank() }?.let { texts.add(it) }
            node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let { texts.add(it) }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    collectTexts(child, texts, depth + 1)
                    // recycle() removido: deprecated desde API 33 e desnecessário com GC moderno
                }
            }
        } catch (_: Exception) {}
    }

    /** Retorna o texto de erro encontrado, ou null se não encontrar */
    private fun findHttpError(text: String): String? {
        if (text.isBlank()) return null
        for (pattern in ERROR_PATTERNS) {
            val match = pattern.find(text) ?: continue
            // Retorna um contexto ao redor do match (máx 200 chars)
            val start = maxOf(0, match.range.first - 40)
            val end = minOf(text.length, match.range.last + 80)
            return text.substring(start, end).trim()
        }
        return null
    }

    private fun sendErrorIfNew(errorText: String) {
        val now = System.currentTimeMillis()
        // Debounce: não enviar o mesmo erro dentro de 5s
        if (errorText == lastSentError && now - lastSentTime < DEBOUNCE_MS) return

        lastSentError = errorText
        lastSentTime = now

        Log.d(TAG, "Erro HTTP/HTTPS detectado no WMS (UI): $errorText")

        val intent = Intent("com.mdm.launcher.WMS_ERROR").apply {
            setPackage(packageName)
            putExtra("error_text", "🌐 Erro HTTP/HTTPS WMS: $errorText")
        }
        sendBroadcast(intent)
    }

    override fun onInterrupt() {
        Log.d(TAG, "AccessibilityService interrompido")
    }
}
