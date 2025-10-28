# 📱 Gerador de QR Code - MDM Launcher

Ferramenta simples para gerar QR codes no terminal para download do APK.

## 🚀 Como Usar

### Opção 1: Windows (Duplo Clique)

Execute `gerar-qrcode.bat` diretamente ou:

```bash
.\gerar-qrcode.bat
```

### Opção 2: Node.js Direto

```bash
node gerar-qrcode.js
```

### Opção 3: Link Customizado

```bash
node gerar-qrcode.js "https://seu-link-aqui.com"
```

### Opção 4: Via npm

```bash
npm run qr
```

## 📋 Pré-requisitos

- **Node.js** instalado (versão 12+)
- **npm** (vem com Node.js)

### Instalar Node.js

Baixe em: https://nodejs.org/

## 🔧 Instalação

Se for a primeira vez, instale as dependências:

```bash
npm install
```

Isso irá instalar o `qrcode-terminal`.

## 📱 Exemplos de Uso

### 1. Gerar QR Code do APK Padrão

```bash
node gerar-qrcode.js
```

Saída:
```
╔══════════════════════════════════════════════════════════════╗
║           📱 Gerador de QR Code - MDM Launcher              ║
╚══════════════════════════════════════════════════════════════╝

📍 Link: https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk

📱 Escaneie o QR Code abaixo com seu dispositivo Android:

[QR CODE APARECE AQUI]
```

### 2. Gerar QR Code de Outro Link

```bash
node gerar-qrcode.js "https://exemplo.com/meu-apk.apk"
```

### 3. Gerar QR Code de URL Local

```bash
node gerar-qrcode.js "http://192.168.1.100:8000/app-debug.apk"
```

## 🎯 Casos de Uso

### 1. Compartilhar APK em Rede Local

1. Coloque o APK em um servidor web local
2. Gere o QR code com o IP local:
   ```bash
   node gerar-qrcode.js "http://192.168.1.100:8000/app-debug.apk"
   ```
3. Escaneie com o celular

### 2. Download de Servidor Remoto

```bash
node gerar-qrcode.js "https://seu-servidor.com/mdm-launcher.apk"
```

### 3. GitHub Releases

```bash
node gerar-qrcode.js "https://github.com/usuario/repo/releases/download/v1.0/app.apk"
```

## 🛠️ Customização

### Editar Link Padrão

Abra `gerar-qrcode.js` e modifique:

```javascript
const DEFAULT_LINK = 'https://seu-link-aqui.com/app.apk';
```

### Tamanho do QR Code

No arquivo `gerar-qrcode.js`, altere:

```javascript
// QR Code pequeno (atual)
qrcode.generate(link, { small: true })

// QR Code normal
qrcode.generate(link, { small: false })
```

## 📦 Arquivos

```
mdm-owner/
├── gerar-qrcode.js       ← Script Node.js principal
├── gerar-qrcode.bat      ← Script Windows
├── package.json          ← Configuração npm
└── node_modules/         ← Dependências (após npm install)
    └── qrcode-terminal/
```

## 🐛 Troubleshooting

### ❌ "Node.js não encontrado"

**Solução:**
1. Instale Node.js: https://nodejs.org/
2. Reinicie o terminal
3. Teste: `node --version`

### ❌ "Cannot find module 'qrcode-terminal'"

**Solução:**
```bash
npm install
```

### ❌ QR Code não aparece no terminal

**Solução:**
- Use terminal com suporte Unicode (PowerShell, CMD moderno)
- Windows Terminal funciona perfeitamente
- Git Bash também funciona

### ❌ Link muito longo para QR code

**Solução:**
- Use encurtador de URL (bit.ly, tinyurl)
- Hospede o APK em servidor próprio com URL curta

## 💡 Dicas

### 1. Criar Servidor Local Rápido

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server -p 8000
```

Depois gere o QR code:
```bash
node gerar-qrcode.js "http://192.168.1.X:8000/app-debug.apk"
```

### 2. Salvar QR Code como Imagem

Para salvar como PNG, use a biblioteca `qrcode`:

```bash
npm install qrcode
npx qrcode "https://seu-link.com" -o qrcode.png
```

### 3. Múltiplos Links

Crie um arquivo `links.txt`:
```
https://link1.com/app1.apk
https://link2.com/app2.apk
https://link3.com/app3.apk
```

Execute:
```bash
for /f %i in (links.txt) do node gerar-qrcode.js "%i"
```

## 📞 Suporte

Problemas comuns:
- Verificar Node.js instalado
- Executar `npm install` antes de usar
- Terminal com suporte Unicode

---

## 📚 Documentação Relacionada

- **[../README.md](../README.md)** - Documentação principal do projeto
- **[../DEPLOY-GUIDE.md](../DEPLOY-GUIDE.md)** - Guia completo de deploy
- **[../ATUALIZACAO-AUTOMATICA.md](../ATUALIZACAO-AUTOMATICA.md)** - Sistema de atualização de APK

---

**Última atualização:** 28/10/2025

**Criado com ❤️ para facilitar o compartilhamento do MDM Launcher**

