/**
 * Configuração centralizada de portas do MDM
 * Porta 3000 = Next.js (frontend)
 * Porta 3001 = WebSocket (servidor)
 * Porta 3002 = NÃO USADA (removida - use 3001)
 */

module.exports = {
  NEXT_PORT: parseInt(process.env.PORT || '3000', 10),
  WEBSOCKET_PORT: parseInt(process.env.WEBSOCKET_PORT || '3001', 10),
}
