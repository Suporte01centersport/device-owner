/**
 * Servidor de Descoberta Automática MDM
 * 
 * Responde a broadcasts UDP na porta 3003 permitindo que dispositivos
 * descubram automaticamente o servidor MDM na rede local.
 */

const dgram = require('dgram');
const os = require('os');

const DISCOVERY_PORT = 3003;
const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || '3001', 10);

class DiscoveryServer {
    constructor() {
        this.server = dgram.createSocket('udp4');
        this.setupServer();
    }

    setupServer() {
        this.server.on('error', (err) => {
            console.error(`❌ Erro no servidor de descoberta: ${err.message}`);
            this.server.close();
        });

        this.server.on('message', (msg, rinfo) => {
            const message = msg.toString();
            console.log(`📡 Broadcast recebido de ${rinfo.address}:${rinfo.port} - "${message}"`);

            // Verificar se é uma mensagem de descoberta MDM
            if (message === 'MDM_DISCOVERY') {
                const response = `MDM_SERVER:${WEBSOCKET_PORT}`;
                
                // Enviar resposta para o dispositivo
                this.server.send(response, rinfo.port, rinfo.address, (err) => {
                    if (err) {
                        console.error(`❌ Erro ao enviar resposta: ${err.message}`);
                    } else {
                        console.log(`✓ Resposta enviada para ${rinfo.address}:${rinfo.port} - "${response}"`);
                    }
                });
            }
        });

        this.server.on('listening', () => {
            const address = this.server.address();
            const serverIPs = this.getServerIPs();
            
            console.log('\n🔍 ═══════════════════════════════════════════════');
            console.log('   SERVIDOR DE DESCOBERTA MDM INICIADO');
            console.log('═══════════════════════════════════════════════');
            console.log(`📡 Porta UDP de descoberta: ${address.port}`);
            console.log(`🌐 WebSocket será anunciado na porta: ${WEBSOCKET_PORT}`);
            console.log('\n📍 IPs disponíveis para conexão:');
            serverIPs.forEach(ip => {
                console.log(`   - ws://${ip}:${WEBSOCKET_PORT}`);
            });
            console.log('\n💡 Dispositivos podem se conectar automaticamente');
            console.log('   enviando broadcast UDP "MDM_DISCOVERY" para porta 3003');
            console.log('═══════════════════════════════════════════════\n');
        });

        // Bind na porta de descoberta
        this.server.bind(DISCOVERY_PORT);
    }

    /**
     * Obtém todos os IPs do servidor (útil para múltiplas interfaces)
     */
    getServerIPs() {
        const interfaces = os.networkInterfaces();
        const ips = [];

        Object.keys(interfaces).forEach(ifname => {
            interfaces[ifname].forEach(iface => {
                // Ignorar endereços internos e IPv6
                if (iface.family === 'IPv4' && !iface.internal) {
                    ips.push(iface.address);
                }
            });
        });

        return ips;
    }

    close() {
        this.server.close();
        console.log('🔴 Servidor de descoberta encerrado');
    }
}

// Exportar para uso em outros módulos
module.exports = DiscoveryServer;

// Se executado diretamente, iniciar o servidor
if (require.main === module) {
    const discoveryServer = new DiscoveryServer();

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\n⚠️  Recebido sinal de interrupção...');
        discoveryServer.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n\n⚠️  Recebido sinal de término...');
        discoveryServer.close();
        process.exit(0);
    });
}

