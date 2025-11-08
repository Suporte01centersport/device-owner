const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ENV_FLAG = '__MDM_ENV_INITIALIZED__';

if (!process.env[ENV_FLAG]) {
    const candidate =
        process.env.DOTENV_CONFIG_PATH ||
        process.env.dotenv_config_path ||
        process.env.ENV_FILE ||
        '.env';
    const resolvedPath = path.resolve(process.cwd(), candidate);

    if (!fs.existsSync(resolvedPath)) {
        console.warn(`⚠️  Arquivo de ambiente "${resolvedPath}" não encontrado. Variáveis padrão podem ser utilizadas.`);
    } else {
        dotenv.config({ path: resolvedPath });
        console.log(`🔐 Variáveis de ambiente carregadas de: ${resolvedPath}`);
    }

    process.env[ENV_FLAG] = resolvedPath;
}

module.exports = process.env[ENV_FLAG];

