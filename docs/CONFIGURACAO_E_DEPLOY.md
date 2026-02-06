# Configuração e Deploy - MDM Owner

Guia completo de configuração e deploy para ambientes de **Produção** (Ubuntu/Linux) e **Desenvolvimento** (Windows).

> **📌 IMPORTANTE:**
> - Caminhos como `/opt/mdm-owner` são **exemplos**. Use o caminho onde você clonou o projeto.
> - Nome do banco de dados (`mdm_owner`) é padrão. Verifique seu arquivo de ambiente (ex.: `.env.production`) se for diferente.
> - Este guia serve tanto para **servidor Linux de produção** quanto **localhost para testes**.
> 
> **📦 Estrutura de Arquivos:**
> ```
> device-owner/
> ├── deploy-production.sh          # Script deploy Ubuntu (produção)
> ├── start-dev-windows.bat         # Script desenvolvimento Windows
> ├── docs/
> │   └── CONFIGURACAO_E_DEPLOY.md  # Este guia
> └── mdm-frontend/
>     ├── env.production.example    # Template produção
>     ├── env.development.example   # Template desenvolvimento
>     └── package.json              # Scripts npm
> ```

## 📋 Índice

1. [Servidor Ubuntu (Produção)](#servidor-ubuntu-produção)
2. [PC Windows (Desenvolvimento)](#pc-windows-desenvolvimento)
3. [Configurações de Rede](#configurações-de-rede)
4. [Discovery Server UDP](#discovery-server-udp)
5. [Reconexão Automática](#reconexão-automática-após-reiniciar-servidor)
6. [Monitoramento](#monitoramento)
7. [Troubleshooting](#troubleshooting)

---

## 🖥️ Servidor Ubuntu (Produção)

### Pré-requisitos

```bash
# Instalar Node.js 18+ e npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Instalar PM2 (gerenciador de processos)
sudo npm install -g pm2

# Instalar Git
sudo apt-get install -y git
```

### Configuração Inicial

```bash
# 1. Clonar o repositório (ajuste o caminho conforme preferir)
git clone <seu-repositorio> /opt/mdm-owner
# ou
# git clone <seu-repositorio> /home/$USER/device-owner

cd /opt/mdm-owner  # ou o caminho que você escolheu

# 2. Tornar script executável
chmod +x deploy-production.sh

# 3. Executar deploy
./deploy-production.sh
```

**Dica:** Anote o caminho escolhido para uso nos próximos comandos.

### Editar Configurações de Produção

Após o primeiro deploy, **OBRIGATORIAMENTE** edite as senhas:

```bash
cd /opt/mdm-owner/mdm-frontend
nano .env.production
```

Altere estas linhas:

```env
DB_NAME=mdm_owner              # Nome do banco (ajuste se necessário)
DB_PASSWORD=SUA_SENHA_SEGURA_AQUI
ADMIN_PASSWORD=SUA_SENHA_ADMIN_AQUI
JWT_SECRET=STRING_ALEATORIA_LONGA_AQUI
```

**Dica:** Execute `sudo -u postgres psql -c "\l" | grep mdm` para ver o nome do seu banco.

**Reinicie os serviços após alteração:**

```bash
pm2 restart all
```

### Configurar Firewall

```bash
# Abrir portas necessárias
sudo ufw allow 3000/tcp  # Frontend web
sudo ufw allow 3002/tcp  # WebSocket MDM
sudo ufw allow 3003/udp  # Discovery Server (broadcast)

# Verificar status
sudo ufw status

# Habilitar firewall
sudo ufw enable
```

### Configuração de Rede

#### Verificar IPs Disponíveis
```bash
# Verificar IPs disponíveis
ip addr show

# ou
hostname -I
```

#### Configurar IP Estático (Recomendado)

Para que o launcher Android consiga acessar o servidor Linux independente da rede, é recomendado configurar IP estático:

```bash
sudo nano /etc/netplan/01-netcfg.yaml
```

**Exemplo de configuração IP estático:**
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.2.100/24  # IP fixo do servidor
      gateway4: 192.168.2.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

Aplicar mudanças:
```bash
sudo netplan apply
```

#### DNS Local (Opcional mas Recomendado)

Para usar `mdm.local` em vez de IP:

```bash
# Instalar dnsmasq
sudo apt install dnsmasq

# Configurar
sudo nano /etc/dnsmasq.conf
```

**Adicionar ao dnsmasq.conf:**
```
# MDM Server
address=/mdm.local/192.168.2.100
```

**Reiniciar:**
```bash
sudo systemctl restart dnsmasq
sudo systemctl enable dnsmasq
```

### Discovery Server UDP (Porta 3003)

O servidor Linux precisa rodar o **Discovery Server** na porta 3003 para responder aos broadcasts UDP. Isso permite que o launcher Android descubra automaticamente o servidor.

> **Nota:** o script `deploy-production.sh` e o `pm2 start ecosystem.config.js` já registram o processo `mdm-discovery`. Use os comandos abaixo apenas se precisar iniciar manualmente.

#### Iniciar Discovery Server

```bash
# No diretório do projeto
cd /opt/mdm-owner/mdm-frontend
# ou seu caminho: cd /home/$USER/device-owner/mdm-frontend

# Iniciar servidor de descoberta
node server/discovery-server.js
```

#### Adicionar ao PM2

```bash
# Adicionar ao PM2 para iniciar automaticamente
pm2 start server/discovery-server.js --name "mdm-discovery"
pm2 save
pm2 startup
```

### Configuração do Servidor WebSocket

Verificar se o arquivo `.env.production` está configurado corretamente:

```bash
# Verificar configuração
cat mdm-frontend/.env.production
```

**Configuração mínima necessária:**
```env
NODE_ENV=production
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=0.0.0.0
LOG_LEVEL=info
```

### Script de Inicialização Automática

Criar script para iniciar todos os serviços:

```bash
# Criar script
sudo nano /opt/mdm-owner/start-services.sh
```

**Conteúdo do script:**
```bash
#!/bin/bash

echo "🚀 Iniciando serviços MDM..."

# Ir para diretório do projeto
cd /opt/mdm-owner/mdm-frontend

# Iniciar todos os serviços
pm2 start ecosystem.config.js

# Iniciar servidor de descoberta se não estiver rodando
if ! pm2 list | grep -q "mdm-discovery"; then
    pm2 start server/discovery-server.js --name "mdm-discovery"
fi

# Salvar configuração
pm2 save

echo "✅ Todos os serviços iniciados!"
pm2 status
```

**Tornar executável:**
```bash
sudo chmod +x /opt/mdm-owner/start-services.sh
```

### Comandos Úteis - Produção

```bash
# Ver status dos serviços
pm2 list

# Ver logs em tempo real
pm2 logs

# Ver logs do WebSocket
pm2 logs mdm-websocket

# Ver logs do Frontend
pm2 logs mdm-frontend

# Ver logs do Discovery Server
pm2 logs mdm-discovery

# Reiniciar serviços
pm2 restart all

# Parar serviços
pm2 stop all

# Atualizar código e reiniciar
cd /opt/mdm-owner
git pull
cd mdm-frontend
npm install
npm run build
pm2 restart all
```

### Verificação de Serviços

```bash
# Verificar se todos os serviços estão rodando
pm2 status

# Deve mostrar:
# - mdm-frontend (porta 3000)
# - mdm-websocket (porta 3002)  
# - mdm-discovery (porta 3003)
```

---

## 💻 PC Windows (Desenvolvimento)

### Pré-requisitos

1. Node.js 18+ instalado
2. PostgreSQL instalado e rodando
3. Git instalado

### Configuração Inicial

```powershell
# 1. Navegar até o projeto
cd C:\Desenvolvimento\device-owner

# 2. Executar script de desenvolvimento
.\start-dev-windows.bat
```

### Arquivos de ambiente (Desenvolvimento)

O script cria automaticamente o `.env.development` a partir do template `env.development.example` e gera um `.env` base para compatibilidade com o Next.js.

**Localização principal:** `mdm-frontend\.env.development`

### Comandos Úteis - Desenvolvimento

```powershell
# Iniciar ambiente completo (WebSocket + Frontend)
cd mdm-frontend
npm run dev:all

# Iniciar apenas Frontend
npm run dev

# Iniciar apenas WebSocket
npm run dev:websocket

# Recriar banco de dados
npm run db:setup

# Limpar dispositivos órfãos
npm run cleanup-devices:confirm
```

---

## 🌐 Configurações de Rede

### Conectar App Android ao Servidor

#### Servidor Ubuntu (Produção)

1. **Descobrir IP do servidor:**
   ```bash
   ip addr show
   # ou
   hostname -I
   ```

2. **No App Android:**
   - IP: `SEU_IP_SERVIDOR`
   - Porta WebSocket: `3002`
   - Porta Frontend: `3000`
   - Porta Discovery: `3003` (UDP)

#### PC Windows (Desenvolvimento)

1. **Descobrir IP do PC:**
   ```powershell
   ipconfig
   # Procure por "Endereço IPv4"
   ```

2. **No App Android:**
   - IP: `SEU_IP_PC`
   - Porta WebSocket: `3002`
   - Porta Frontend: `3000`

### Testar Conectividade

```bash
# Do Android ou outro dispositivo, testar:
curl http://SEU_IP:3000    # Frontend
curl http://SEU_IP:3002    # WebSocket
```

### Testes de Conectividade Específicos

#### Teste 1: Discovery Server
```bash
# Testar broadcast UDP
echo "MDM_DISCOVERY" | nc -u 192.168.2.100 3003

# Deve retornar: MDM_SERVER:3002
```

#### Teste 2: WebSocket
```bash
# Testar conexão WebSocket
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     http://192.168.2.100:3002
```

#### Teste 3: Frontend Web
```bash
# Testar frontend
curl http://192.168.2.100:3000

# Deve retornar HTML da página
```

---

## 📊 Monitoramento

### Logs em Tempo Real

```bash
# Ver logs de todos os serviços
pm2 logs

# Ver logs específicos
pm2 logs mdm-discovery
pm2 logs mdm-websocket
pm2 logs mdm-frontend
```

### Status dos Serviços

```bash
# Status geral
pm2 status

# Informações detalhadas
pm2 show mdm-discovery
pm2 show mdm-websocket
pm2 show mdm-frontend
```

### PM2 Dashboard Web

```bash
# Instalar PM2 Plus (opcional)
pm2 install pm2-server-monit

# Ver dashboard
pm2 web
# Acesse: http://SEU_IP:9615
```

### Logs Estruturados

```bash
# Salvar logs em arquivo
pm2 logs --out mdm.log

# Rotação de logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

---

## 🔄 Reconexão Automática após Reiniciar Servidor

O sistema agora **reconecta automaticamente** quando você reinicia o servidor:

### Novo Comportamento

```bash
# Reiniciar servidor
pm2 restart mdm-websocket

# ✅ Launchers reconectam automaticamente em 10-20 segundos
# ❌ ANTES: Era necessário reinstalar o app
```

### Melhorias Implementadas

- ✅ **Timeout de 15s** - detecta tentativa travada e reseta
- ✅ **3 tentativas** - após falhar 3x, invalida cache e redescobre servidor  
- ✅ **Health check** - verifica a cada 60s se está travado (timeout 2min)
- ✅ **Cache 30s** - reduzido de 60s para reconexão mais rápida

### Quando Testar

- Após fazer `pm2 restart all`
- Após atualizar código e fazer `git pull`
- Após reiniciar servidor Linux completamente

**Tempo esperado de reconexão:** 10-20 segundos

---

## 🔍 Troubleshooting

### Servidor Ubuntu

#### Serviços não iniciam

```bash
# Verificar logs
pm2 logs --lines 100

# Verificar se portas estão em uso
sudo netstat -tulpn | grep -E '3000|3002|3003'

# Matar processos nas portas
sudo kill -9 $(sudo lsof -t -i:3000)
sudo kill -9 $(sudo lsof -t -i:3002)
sudo kill -9 $(sudo lsof -t -i:3003)

# Reiniciar
pm2 restart all
```

#### Banco de dados não conecta

```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Iniciar PostgreSQL
sudo systemctl start postgresql

# Verificar conexão (substitua mdm_owner pelo nome do seu banco)
psql -U mdm_user -d mdm_owner -h localhost

# Ver bancos existentes
sudo -u postgres psql -c "\l" | grep mdm
```

#### Firewall bloqueando

```bash
# Verificar regras
sudo ufw status

# Desabilitar firewall temporariamente (apenas para teste)
sudo ufw disable

# Se resolver, configure as regras corretas
sudo ufw allow 3000/tcp
sudo ufw allow 3002/tcp
sudo ufw allow 3003/udp
sudo ufw enable
```

#### Porta 3003 não responde

```bash
# Verificar se está rodando
sudo netstat -tulpn | grep 3003

# Reiniciar discovery server
pm2 restart mdm-discovery

# Verificar logs
pm2 logs mdm-discovery
```

#### IP mudou

```bash
# Verificar IP atual
ip addr show

# Atualizar configuração do Android se necessário
# (recompilar APK com novo IP)
```

#### "Permission denied" no Ubuntu

```bash
# Dar permissões corretas
sudo chown -R $USER:$USER /opt/mdm-owner
chmod +x deploy-production.sh
```

### PC Windows

#### Portas em uso

```powershell
# Ver processos nas portas
netstat -ano | findstr ":3000"
netstat -ano | findstr ":3002"

# Matar processo (use o PID do comando acima)
taskkill /PID <PID> /F
```

#### Firewall Windows bloqueando

1. Painel de Controle → Firewall do Windows
2. Configurações Avançadas
3. Regras de Entrada → Nova Regra
4. Porta → TCP → 3000, 3002
5. Permitir conexão

### Problemas Comuns

#### "Cannot connect to database"

- Verifique se PostgreSQL está rodando
- Verifique credenciais no arquivo de ambiente correspondente (`.env.development` no Windows, `.env.production` no servidor)
- Verifique se banco foi criado (`npm run db:setup`)
- Verifique nome do banco no arquivo de ambiente (`DB_NAME`)
  ```bash
  # Ver bancos existentes
  sudo -u postgres psql -c "\l" | grep mdm
  ```

#### "WebSocket connection failed"

- Verifique se o servidor WebSocket está rodando
- Verifique firewall
- Teste com `curl http://IP:3002`

#### Discovery Server não funciona

- Verifique se está rodando: `pm2 status | grep discovery`
- Verifique firewall UDP: `sudo ufw status | grep 3003`
- Teste com: `echo "MDM_DISCOVERY" | nc -u IP_SERVIDOR 3003`

---

## 🔐 Segurança - Produção

### Recomendações

1. **Altere TODAS as senhas padrão**
2. **Use HTTPS com certificado SSL**
3. **Configure rate limiting**
4. **Mantenha sistema atualizado:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

5. **Backup automático do banco:**
   ```bash
   # Criar script de backup
   nano /opt/backup-mdm.sh
   ```
   
   Conteúdo:
   ```bash
   #!/bin/bash
   # Substitua mdm_owner pelo nome do seu banco (ex: mdm_database)
   pg_dump -U mdm_user mdm_owner > /opt/backups/mdm_$(date +%Y%m%d_%H%M%S).sql
   ```

6. **Configurar backup no cron:**
   ```bash
   crontab -e
   # Adicionar: backup diário às 2h
   0 2 * * * /opt/backup-mdm.sh
   ```

---

## 📱 Configurar App Android

### QR Code para configuração

```bash
# No servidor de produção
cd mdm-owner
node gerar-qrcode.js
```

Use o QR Code gerado para configurar os dispositivos Android automaticamente.

---

## 🔄 Fluxo de Trabalho Recomendado

### Desenvolvimento (Windows)

1. Fazer alterações no código
2. Testar localmente com `npm run dev:all`
3. Commit e push para o repositório

```powershell
git add .
git commit -m "Descrição das alterações"
git push origin main
```

### Atualizar Produção (Ubuntu)

```bash
# No servidor Ubuntu
cd /opt/mdm-owner
git pull origin main
cd mdm-frontend
npm install
npm run build
pm2 restart all
```

---

## ✅ Checklist Final

### Configuração Inicial
- [ ] Node.js 18+ instalado
- [ ] PostgreSQL instalado e rodando
- [ ] PM2 instalado globalmente
- [ ] Repositório clonado

### Servidor Linux
- [ ] Firewall configurado (portas 3000, 3002, 3003)
- [ ] Discovery Server rodando na porta 3003
- [ ] WebSocket Server rodando na porta 3002
- [ ] Frontend rodando na porta 3000
- [ ] IP estático configurado (recomendado)
- [ ] DNS local configurado (opcional)
- [ ] PM2 configurado para iniciar automaticamente
- [ ] Senhas alteradas no `.env.production`
- [ ] Testes de conectividade passando

### Desenvolvimento Windows
- [ ] Node.js instalado
- [ ] PostgreSQL instalado e rodando
- [ ] Arquivo `.env.development` criado
- [ ] Script `start-dev-windows.bat` funcionando

---

## 🎯 Resultado Esperado

Com essas configurações, o launcher Android conseguirá:

1. **Descobrir automaticamente** o servidor via broadcast UDP (porta 3003)
2. **Conectar via WebSocket** na porta 3002
3. **Manter conexão estável** mesmo com mudanças de rede
4. **Reconectar automaticamente** após reiniciar o servidor (10-20 segundos)
5. **Usar fallbacks** para múltiplos IPs se configurado

O sistema ficará **100% resiliente** para acessar o servidor Linux! 🚀

---

## 🎯 Resumo Rápido

### **Servidor Ubuntu (Produção)**
```bash
./deploy-production.sh
pm2 list
pm2 logs
```

### **PC Windows (Desenvolvimento)**
```powershell
.\start-dev-windows.bat
```

### **Ambos os ambientes funcionam simultaneamente!**
- Ubuntu: versão estável para produção
- Windows: testes e desenvolvimento

---

## 📚 Documentação Relacionada

- **[README.md](../README.md)** - Documentação principal do projeto
- **[PERFORMANCE_E_ESCALABILIDADE.md](./PERFORMANCE_E_ESCALABILIDADE.md)** - Guia de performance e escalabilidade
- **[ATUALIZACAO-AUTOMATICA.md](../ATUALIZACAO-AUTOMATICA.md)** - Sistema de atualização remota de APK

---

**Última atualização:** 28/10/2025  
**Versão:** 1.2.0

> **🎯 Desenvolvimento baseado em:** ScaleFusion - Plataforma líder de UEM (Unified Endpoint Management)

