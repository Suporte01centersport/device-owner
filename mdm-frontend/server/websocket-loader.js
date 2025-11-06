// Helper para carregar o módulo websocket de forma dinâmica
// Este arquivo não é processado pelo webpack da mesma forma que os arquivos em app/
const path = require('path');
const fs = require('fs');

function loadWebsocketModule() {
  try {
    const websocketPath = path.resolve(__dirname, 'websocket.js');
    
    if (!fs.existsSync(websocketPath)) {
      throw new Error(`Módulo websocket não encontrado em: ${websocketPath}`);
    }
    
    // Usar require dinâmico
    return require(websocketPath);
  } catch (error) {
    console.error('Erro ao carregar módulo websocket:', error);
    throw error;
  }
}

module.exports = { loadWebsocketModule };

