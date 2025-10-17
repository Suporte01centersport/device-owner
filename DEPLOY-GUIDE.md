# 🚀 Guia de Deploy - Ambientes Produção e Desenvolvimento

## 📋 Sumário

- [Servidor Ubuntu (Produção)](#servidor-ubuntu-produção)
- [PC Windows (Desenvolvimento)](#pc-windows-desenvolvimento)
- [Configurações de Rede](#configurações-de-rede)
- [Troubleshooting](#troubleshooting)

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
# 1. Clonar o repositório (se ainda não clonou)
git clone <seu-repositorio> /opt/mdm-owner
cd /opt/mdm-owner

# 2. Tornar script executável
chmod +x deploy-production.sh

# 3. Executar deploy
./deploy-production.sh
```

### Editar Configurações de Produção

Após o primeiro deploy, **OBRIGATORIAMENTE** edite as senhas:

```bash
cd /opt/mdm-owner/mdm-frontend
nano .env
```

Altere estas linhas:

```env
DB_PASSWORD=SUA_SENHA_SEGURA_AQUI
ADMIN_PASSWORD=SUA_SENHA_ADMIN_AQUI
JWT_SECRET=STRING_ALEATORIA_LONGA_AQUI
```

**Reinicie os serviços após alteração:**

```bash
pm2 restart all
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

### Configurar Firewall

```bash
# Permitir portas necessárias
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 3002/tcp  # WebSocket
sudo ufw enable
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

### Arquivo .env (Desenvolvimento)

O script cria automaticamente o `.env` com base no `.env.development`.

**Localização:** `mdm-frontend\.env`

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
curl http://SEU_IP:3000
curl http://SEU_IP:3002
```

---

## 🔍 Troubleshooting

### Servidor Ubuntu

#### Serviços não iniciam

```bash
# Verificar logs
pm2 logs --lines 100

# Verificar se portas estão em uso
sudo netstat -tulpn | grep -E '3000|3002'

# Matar processos nas portas
sudo kill -9 $(sudo lsof -t -i:3000)
sudo kill -9 $(sudo lsof -t -i:3002)

# Reiniciar
pm2 restart all
```

#### Banco de dados não conecta

```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Iniciar PostgreSQL
sudo systemctl start postgresql

# Verificar conexão
psql -U mdm_user -d mdm_owner -h localhost
```

#### Firewall bloqueando

```bash
# Desabilitar firewall temporariamente (apenas para teste)
sudo ufw disable

# Se resolver, configure as regras corretas
sudo ufw allow 3000/tcp
sudo ufw allow 3002/tcp
sudo ufw enable
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
- Verifique credenciais no `.env`
- Verifique se banco foi criado (`npm run db:setup`)

#### "WebSocket connection failed"

- Verifique se o servidor WebSocket está rodando
- Verifique firewall
- Teste com `curl http://IP:3002`

#### "Permission denied" no Ubuntu

```bash
# Dar permissões corretas
sudo chown -R $USER:$USER /opt/mdm-owner
chmod +x deploy-production.sh
```

---

## 📊 Monitoramento - Produção

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

**Última atualização:** $(date)
**Versão:** 1.0.0

