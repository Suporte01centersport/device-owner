# 🐧 CONFIGURAÇÃO DO SERVIDOR LINUX

## 📋 **RESUMO**
Para que o launcher Android consiga acessar o servidor Linux independente da rede, algumas configurações são necessárias no servidor.

## 🔧 **CONFIGURAÇÕES NECESSÁRIAS**

### **1. Firewall - Portas Abertas**
```bash
# Abrir portas necessárias
sudo ufw allow 3000/tcp  # Frontend web
sudo ufw allow 3002/tcp  # WebSocket MDM
sudo ufw allow 3003/udp  # Discovery Server (broadcast)

# Verificar status
sudo ufw status
```

### **2. Servidor de Descoberta UDP (Porta 3003)**
O servidor Linux precisa rodar o **Discovery Server** na porta 3003 para responder aos broadcasts UDP:

```bash
# No diretório do projeto
cd /opt/mdm-owner/mdm-frontend
# ou seu caminho: cd /home/$USER/device-owner/mdm-frontend

# Iniciar servidor de descoberta
node server/discovery-server.js
```

**Ou adicionar ao PM2:**
```bash
# Adicionar ao PM2 para iniciar automaticamente
pm2 start server/discovery-server.js --name "mdm-discovery"
pm2 save
pm2 startup
```

### **3. Configuração de Rede**
```bash
# Verificar IPs disponíveis
ip addr show

# Configurar IP estático (recomendado)
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

### **4. DNS Local (Opcional mas Recomendado)**
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

### **5. Configuração do Servidor WebSocket**
Verificar se o arquivo `.env` está configurado corretamente:

```bash
# Verificar configuração
cat mdm-frontend/.env
```

**Configuração mínima necessária:**
```env
NODE_ENV=production
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=0.0.0.0
LOG_LEVEL=info
```

### **6. Verificação de Serviços**
```bash
# Verificar se todos os serviços estão rodando
pm2 status

# Deve mostrar:
# - mdm-frontend (porta 3000)
# - mdm-websocket (porta 3002)  
# - mdm-discovery (porta 3003)
```

## 🧪 **TESTES DE CONECTIVIDADE**

### **Teste 1: Discovery Server**
```bash
# Testar broadcast UDP
echo "MDM_DISCOVERY" | nc -u 192.168.2.100 3003

# Deve retornar: MDM_SERVER:3002
```

### **Teste 2: WebSocket**
```bash
# Testar conexão WebSocket
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     http://192.168.2.100:3002
```

### **Teste 3: Frontend Web**
```bash
# Testar frontend
curl http://192.168.2.100:3000

# Deve retornar HTML da página
```

## 🔄 **SCRIPT DE INICIALIZAÇÃO AUTOMÁTICA**

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

## 📊 **MONITORAMENTO**

### **Logs em Tempo Real**
```bash
# Ver logs de todos os serviços
pm2 logs

# Ver logs específicos
pm2 logs mdm-discovery
pm2 logs mdm-websocket
```

### **Status dos Serviços**
```bash
# Status geral
pm2 status

# Informações detalhadas
pm2 show mdm-discovery
pm2 show mdm-websocket
```

## ⚠️ **PROBLEMAS COMUNS**

### **1. Porta 3003 não responde**
```bash
# Verificar se está rodando
sudo netstat -tulpn | grep 3003

# Reiniciar discovery server
pm2 restart mdm-discovery
```

### **2. Firewall bloqueando**
```bash
# Verificar regras
sudo ufw status

# Adicionar regras se necessário
sudo ufw allow 3003/udp
```

### **3. IP mudou**
```bash
# Verificar IP atual
ip addr show

# Atualizar configuração do Android se necessário
# (recompilar APK com novo IP)
```

## ✅ **CHECKLIST FINAL**

- [ ] Firewall configurado (portas 3000, 3002, 3003)
- [ ] Discovery Server rodando na porta 3003
- [ ] WebSocket Server rodando na porta 3002
- [ ] Frontend rodando na porta 3000
- [ ] IP estático configurado (recomendado)
- [ ] DNS local configurado (opcional)
- [ ] PM2 configurado para iniciar automaticamente
- [ ] Testes de conectividade passando

## 🎯 **RESULTADO ESPERADO**

Com essas configurações, o launcher Android conseguirá:

1. **Descobrir automaticamente** o servidor via broadcast UDP
2. **Conectar via WebSocket** na porta 3002
3. **Manter conexão estável** mesmo com mudanças de rede
4. **Usar fallbacks** para múltiplos IPs se configurado

O sistema ficará **100% resiliente** para acessar o servidor Linux! 🚀

---

## 📚 Documentação Relacionada

- **[DEPLOY-GUIDE.md](DEPLOY-GUIDE.md)** - Guia completo de deploy
- **[README.md](README.md)** - Documentação principal do projeto
- **[ATUALIZACAO-AUTOMATICA.md](ATUALIZACAO-AUTOMATICA.md)** - Sistema de atualização de APK

---

**Última atualização:** 28/10/2025

**Consulte também:** [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md) para instruções completas de implantação

> **🎯 Desenvolvimento baseado em:** ScaleFusion - Plataforma líder de UEM (Unified Endpoint Management)