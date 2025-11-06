/**
 * Helper para carregar websocket que evita análise estática do webpack
 * Este arquivo deve estar no diretório server/ para que o webpack o trate como externo
 */
const path = require('path');
const fs = require('fs');

function loadWebSocket() {
  try {
    // Tentar caminho relativo primeiro (quando rodando do diretório server/)
    const relativePath = path.join(__dirname, 'websocket.js');
    if (fs.existsSync(relativePath)) {
      return require(relativePath);
    }
    
    // Tentar caminho absoluto usando process.cwd()
    const absolutePath = path.join(process.cwd(), 'server', 'websocket.js');
    if (fs.existsSync(absolutePath)) {
      return require(absolutePath);
    }
    
    throw new Error(`Não foi possível encontrar websocket.js em ${relativePath} ou ${absolutePath}`);
  } catch (error) {
    console.error('Erro ao carregar websocket:', error);
    throw error;
  }
}

module.exports = loadWebSocket;
