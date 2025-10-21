# 🔧 Configuração de Ambientes - Produção e Desenvolvimento

## 📦 Estrutura de Arquivos Criados

```
device-owner/
├── deploy-production.sh          # Script deploy Ubuntu (produção)
├── start-dev-windows.bat         # Script desenvolvimento Windows
├── DEPLOY-GUIDE.md              # Guia completo de deploy
└── mdm-frontend/
    ├── env.production.example   # Template produção
    ├── env.development.example  # Template desenvolvimento
    └── package.json             # Scripts atualizados
```

---

## 🖥️ SERVIDOR UBUNTU (PRODUÇÃO)

### 1️⃣ Preparar Servidor

```bash
# Instalar dependências
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib git

# Instalar PM2 globalmente
sudo npm install -g pm2

# Clonar projeto (se ainda não fez)
cd /opt
sudo git clone <seu-repo> mdm-owner
sudo chown -R $USER:$USER mdm-owner
```

### 2️⃣ Configurar Ambiente

```bash
cd /opt/mdm-owner/mdm-frontend

# Copiar template de produção
cp env.production.example .env

# IMPORTANTE: Editar e alterar senhas
nano .env
```

**Altere estas linhas OBRIGATORIAMENTE:**
- `DB_PASSWORD=` → Senha forte do banco
- `ADMIN_PASSWORD=` → Senha forte do admin
- `JWT_SECRET=` → String aleatória longa

### 3️⃣ Deploy Automático

```bash
cd /opt/mdm-owner
chmod +x deploy-production.sh
./deploy-production.sh
```

### 4️⃣ Verificar Status

```bash
pm2 list              # Ver serviços
pm2 logs              # Ver logs em tempo real
pm2 restart all       # Reiniciar tudo
```

### 5️⃣ Acesso

- Frontend: `http://IP_DO_SERVIDOR:3000`
- WebSocket: `ws://IP_DO_SERVIDOR:3002`

---

## 💻 PC WINDOWS (DESENVOLVIMENTO)

### 1️⃣ Preparar PC

Certifique-se que tem instalado:
- Node.js 18+
- PostgreSQL
- Git

### 2️⃣ Configurar Ambiente

```powershell
# Navegar até o projeto
cd C:\Desenvolvimento\device-owner\mdm-frontend

# Copiar template de desenvolvimento
copy env.development.example .env
```

### 3️⃣ Iniciar Desenvolvimento

**Opção 1 - Script Automático (Recomendado):**
```powershell
cd C:\Desenvolvimento\device-owner
.\start-dev-windows.bat
```

**Opção 2 - Manual:**
```powershell
cd mdm-frontend
npm install
npm run dev:all
```

### 4️⃣ Acesso

- Frontend: `http://localhost:3000`
- WebSocket: `ws://localhost:3002`

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

## 🌐 Configurar App Android

### Para Servidor Ubuntu (Produção)

```bash
# Descobrir IP do servidor
ip addr show
# ou
hostname -I
```

No app Android:
- Servidor: `http://IP_SERVIDOR:3002`

### Para PC Windows (Desenvolvimento)

```powershell
# Descobrir IP do PC
ipconfig
# Procure "Endereço IPv4"
```

No app Android:
- Servidor: `http://IP_PC:3002`

---

## 🔍 Comandos Úteis

### Servidor Ubuntu

```bash
# Ver logs
pm2 logs mdm-websocket --lines 50
pm2 logs mdm-frontend --lines 50

# Monitorar recursos
pm2 monit

# Resetar PM2
pm2 kill
pm2 resurrect

# Backup banco de dados
pg_dump -U mdm_user mdm_owner > backup_$(date +%Y%m%d).sql
```

### PC Windows

```powershell
# Ver processos nas portas
netstat -ano | findstr "3000"
netstat -ano | findstr "3002"

# Limpar cache npm
npm cache clean --force

# Reinstalar dependências
rmdir /s /q node_modules
npm install
```

---

## 🐛 Troubleshooting Rápido

### Porta em uso

**Ubuntu:**
```bash
sudo lsof -i :3000
sudo lsof -i :3002
sudo kill -9 $(sudo lsof -t -i:3000)
```

**Windows:**
```powershell
netstat -ano | findstr ":3000"
taskkill /PID <PID> /F
```

### Banco não conecta

**Ubuntu:**
```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

**Windows:**
- Abrir "Serviços"
- Procurar "PostgreSQL"
- Iniciar serviço

### PM2 não encontrado

```bash
sudo npm install -g pm2
# ou
npx pm2 <comando>
```

---

## ✅ Checklist de Configuração

### Servidor Ubuntu (Produção)
- [ ] Node.js instalado
- [ ] PostgreSQL instalado e rodando
- [ ] PM2 instalado globalmente
- [ ] Projeto clonado em `/opt/mdm-owner`
- [ ] Arquivo `.env` criado e senhas alteradas
- [ ] Deploy executado com sucesso
- [ ] Firewall configurado (portas 3000, 3002)
- [ ] PM2 configurado para iniciar no boot
- [ ] Backup automático configurado

### PC Windows (Desenvolvimento)
- [ ] Node.js instalado
- [ ] PostgreSQL instalado e rodando
- [ ] Projeto em `C:\Desenvolvimento\device-owner`
- [ ] Arquivo `.env` criado
- [ ] Script `start-dev-windows.bat` funciona
- [ ] Pode acessar `http://localhost:3000`

---

## 📚 Arquivos de Referência

- `DEPLOY-GUIDE.md` - Guia completo com todos os detalhes
- `deploy-production.sh` - Script automático de deploy
- `start-dev-windows.bat` - Script de desenvolvimento Windows
- `env.production.example` - Template de produção
- `env.development.example` - Template de desenvolvimento

---

## 🎯 Próximos Passos

1. ✅ Configurar servidor Ubuntu (produção)
2. ✅ Configurar PC Windows (desenvolvimento)
3. 📱 Gerar QR Code para configurar dispositivos
4. 🔐 Configurar SSL/HTTPS (opcional, recomendado)
5. 📊 Configurar monitoramento (PM2 Plus)
6. 💾 Configurar backups automáticos

---

**Última atualização:** 21/10/2024

**Dúvidas?** Consulte o `DEPLOY-GUIDE.md` para instruções detalhadas!

