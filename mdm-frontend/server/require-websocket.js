/**
 * Helper para carregar websocket que evita análise estática do webpack
 * Este arquivo deve estar no diretório server/ para que o webpack o trate como externo
 */
const path = require('path');

function requireWebsocket() {
  // Usar __dirname para garantir que o caminho seja relativo ao diretório server/
  const websocketPath = path.resolve(__dirname, 'websocket.js');
  return require(websocketPath);
}

module.exports = requireWebsocket;

