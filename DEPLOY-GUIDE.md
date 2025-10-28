# 🚀 Guia de Deploy - MDM Owner

Sistema completo de configuração para ambientes de **Produção** (Ubuntu/Linux) e **Desenvolvimento** (Windows).

> **📌 IMPORTANTE:** 
> - Caminhos como `/opt/mdm-owner` são **exemplos**. Use o caminho onde você clonou o projeto.
> - Nome do banco de dados (`mdm_owner`) é padrão. Verifique seu `.env` se for diferente.
> - Este guia serve tanto para **servidor Linux de produção** quanto **localhost para testes**.
> 
> **📦 Estrutura de Arquivos:**
> ```
> device-owner/
> ├── deploy-production.sh          # Script deploy Ubuntu (produção)
> ├── start-dev-windows.bat         # Script desenvolvimento Windows
> ├── DEPLOY-GUIDE.md               # Este guia
> └── mdm-frontend/
>     ├── env.production.example    # Template produção
>     ├── env.development.example   # Template desenvolvimento
>     └── package.json              # Scripts npm
> ```

## 📋 Sumário

- [Servidor Ubuntu (Produção)](#servidor-ubuntu-produção)
- [PC Windows (Desenvolvimento)](#pc-windows-desenvolvimento)
- [Configurações de Rede](#configurações-de-rede)
- [Reconexão Automática](#reconexão-automática-após-reiniciar-servidor)
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
nano .env
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

# Verificar conexão (substitua mdm_owner pelo nome do seu banco)
psql -U mdm_user -d mdm_owner -h localhost

# Ver bancos existentes
sudo -u postgres psql -c "\l" | grep mdm
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
- Verifique nome do banco no `.env` (DB_NAME)
  ```bash
  # Ver bancos existentes
  sudo -u postgres psql -c "\l" | grep mdm
  ```

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

## 🔄 Reconexão Automática após Reiniciar Servidor

O sistema agora **reconecta automaticamente** quando você reinicia o servidor:

### **Novo Comportamento:**
```bash
# Reiniciar servidor
pm2 restart mdm-websocket

# ✅ Launchers reconectam automaticamente em 10-20 segundos
# ❌ ANTES: Era necessário reinstalar o app
```

### **Melhorias Implementadas:**
- ✅ **Timeout de 15s** - detecta tentativa travada e reseta
- ✅ **3 tentativas** - após falhar 3x, invalida cache e redescobre servidor  
- ✅ **Health check** - verifica a cada 60s se está travado (timeout 2min)
- ✅ **Cache 30s** - reduzido de 60s para reconexão mais rápida

### **Quando Testar:**
- Após fazer `pm2 restart all`
- Após atualizar código e fazer `git pull`
- Após reiniciar servidor Linux completamente

**Tempo esperado de reconexão:** 10-20 segundos

---

## 📚 Documentação Relacionada

- **[README.md](README.md)** - Documentação principal do projeto
- **[CONFIGURACAO-SERVIDOR-LINUX.md](CONFIGURACAO-SERVIDOR-LINUX.md)** - Configuração detalhada do servidor Linux
- **[ATUALIZACAO-AUTOMATICA.md](ATUALIZACAO-AUTOMATICA.md)** - Sistema de atualização remota de APK
- **[QRCODE-README.md](mdm-owner/QRCODE-README.md)** - Gerador de QR Code

---

**Última atualização:** 28/10/2025
**Versão:** 1.1.0

> **🎯 Desenvolvimento baseado em:** ScaleFusion - Plataforma líder de UEM (Unified Endpoint Management)

