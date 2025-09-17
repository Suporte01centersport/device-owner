const fs = require('fs');
const path = require('path');

const ADMIN_PASSWORD_FILE = path.join(__dirname, 'admin_password.json');

console.log('=== TESTE DE CARREGAMENTO DE SENHA ===');
console.log('Arquivo existe?', fs.existsSync(ADMIN_PASSWORD_FILE));

if (fs.existsSync(ADMIN_PASSWORD_FILE)) {
    const data = fs.readFileSync(ADMIN_PASSWORD_FILE, 'utf8');
    console.log('Conteúdo do arquivo:', data);
    const passwordData = JSON.parse(data);
    const password = passwordData.password || '';
    console.log('Senha carregada:', password);
    console.log('Tamanho da senha:', password.length);
} else {
    console.log('Arquivo não encontrado');
}
