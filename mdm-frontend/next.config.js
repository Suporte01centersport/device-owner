/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT || 'http://localhost:80',
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID || 'mdm-project',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Marcar módulos do diretório server/ do PROJETO como externos
      // Mas não interferir com módulos internos do Next.js
      const originalExternal = config.externals || []
      
      config.externals = [
        ...(Array.isArray(originalExternal) ? originalExternal : [originalExternal]),
        ({ request, context }, callback) => {
          if (!request || typeof request !== 'string') {
            // Continuar com o comportamento padrão
            if (typeof originalExternal === 'function') {
              return originalExternal({ request, context }, callback)
            }
            return callback()
          }
          
          const normalizedRequest = request.replace(/\\/g, '/')
          
          // IGNORAR módulos internos do Next.js que começam com '../server/' ou './server/'
          // Esses são módulos internos do Next.js, não do nosso projeto
          if (normalizedRequest.startsWith('../server/') || normalizedRequest.startsWith('./server/')) {
            // Deixar o Next.js processar normalmente
            if (typeof originalExternal === 'function') {
              return originalExternal({ request, context }, callback)
            }
            return callback()
          }
          
          // Tratar como externo se contém 'server/' do nosso projeto
          // Isso identifica nosso módulo do projeto (não módulos internos do Next.js)
          const isServerModule = normalizedRequest.includes('server/websocket') || 
                                 normalizedRequest.includes('server\\websocket') ||
                                 normalizedRequest.includes('server/load-websocket') ||
                                 normalizedRequest.includes('server\\load-websocket') ||
                                 normalizedRequest.includes('server/require-websocket') ||
                                 normalizedRequest.includes('server\\require-websocket')
          
          if (isServerModule) {
            // Contar níveis de diretórios para cima
            const levels = (normalizedRequest.match(/\.\.\//g) || []).length
            // Se tem 4 ou mais níveis, é nosso módulo do projeto
            // Módulos internos do Next.js geralmente têm 1-2 níveis
            // Para rotas profundas como desktop/start, pode ter 6-7 níveis
            if (levels >= 4) {
              return callback(null, `commonjs ${request}`)
            }
            // Tratar como externo independente de ser caminho relativo ou absoluto
            return callback(null, `commonjs ${request}`)
          }
          
          // Tratar path como externo também (usado para construir caminhos dinamicamente)
          if (normalizedRequest === 'path' || normalizedRequest === 'node:path') {
            return callback(null, 'commonjs path')
          }
          
          // Continuar com o comportamento padrão
          if (typeof originalExternal === 'function') {
            return originalExternal({ request, context }, callback)
          }
          callback()
        }
      ]
    }
    return config
  },
}

module.exports = nextConfig
