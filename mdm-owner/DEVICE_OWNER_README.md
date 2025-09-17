# MDM Launcher - Device Owner Setup

## 📱 Configuração como Device Owner

O Device Owner é o nível mais alto de controle em dispositivos Android, permitindo:
- Bloqueio/desbloqueio avançado
- Controle total de apps
- Configuração de restrições
- Gerenciamento remoto completo

## 🔧 Scripts Disponíveis

### 1. `setup-complete.bat` - Setup Completo
```bash
setup-complete.bat
```
**Executa todo o processo automaticamente:**
- Compila o APK
- Prepara o dispositivo
- Instala como Device Owner
- Configura como launcher padrão
- Verifica a configuração

### 2. `install-device-owner.bat` - Instalação
```bash
install-device-owner.bat
```
**Instala o MDM Launcher como Device Owner:**
- Instala o APK
- Configura como Device Owner
- Define como launcher padrão

### 3. `prepare-device-owner.bat` - Preparação
```bash
prepare-device-owner.bat
```
**Prepara o dispositivo:**
- Limpa configurações anteriores
- Remove Device Owners existentes
- Prepara para nova instalação

### 4. `check-device-owner.bat` - Verificação
```bash
check-device-owner.bat
```
**Verifica o status:**
- Device Owner configurado
- Launcher padrão
- Permissões ativas

## ⚠️ Requisitos Importantes

### Dispositivo Deve Estar:
- ✅ **Em modo de fábrica** (factory reset)
- ✅ **SEM contas Google** configuradas
- ✅ **USB Debugging** habilitado
- ✅ **Autorizado** para depuração

### ❌ NÃO Funciona Se:
- Dispositivo já tem contas configuradas
- Outro Device Owner já existe
- Dispositivo não suporta Device Owner
- Não foi feito factory reset

## 🚀 Processo Recomendado

### Para Dispositivo Novo/Resetado:
1. **Factory Reset** do dispositivo
2. **NÃO configure** contas Google
3. **Habilite** USB Debugging
4. **Execute** `setup-complete.bat`

### Para Dispositivo Usado:
1. **Backup** dos dados importantes
2. **Factory Reset** completo
3. **Execute** `prepare-device-owner.bat`
4. **Execute** `install-device-owner.bat`

## 🔍 Verificação de Sucesso

Após a instalação, execute:
```bash
check-device-owner.bat
```

**Deve mostrar:**
```
Device Owners:
  Device Owner: com.mdm.launcher/.DeviceAdminReceiver
  Active: true
```

## 🛠️ Solução de Problemas

### Erro: "Device Owner already exists"
```bash
# Execute para limpar:
prepare-device-owner.bat
```

### Erro: "Not allowed to set device owner"
- Dispositivo não está em modo de fábrica
- Faça factory reset completo
- NÃO configure contas

### Erro: "Package not found"
- Compile o APK primeiro:
```bash
gradlew.bat assembleDebug
```

## 📊 Funcionalidades com Device Owner

### Bloqueio Avançado:
- ✅ Bloqueio imediato via web
- ✅ Timeout configurável
- ✅ Keyguard controlado
- ✅ Desbloqueio programático

### Controle de Apps:
- ✅ Instalar/desinstalar apps
- ✅ Bloquear apps específicos
- ✅ Configurar restrições
- ✅ Lock Task Mode

### Gerenciamento Remoto:
- ✅ Controle via web
- ✅ Configurações remotas
- ✅ Monitoramento em tempo real
- ✅ Comandos instantâneos

## 🔐 Segurança

Com Device Owner, o MDM Launcher tem:
- **Controle total** do dispositivo
- **Impossível desinstalar** sem autorização
- **Acesso a todas** as configurações
- **Controle de rede** e conectividade

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs: `adb logcat | grep "com.mdm.launcher"`
2. Execute `check-device-owner.bat`
3. Consulte a documentação Android sobre Device Owner
4. Teste em dispositivo resetado

---

**Importante:** Device Owner é uma configuração permanente. Para removê-lo, é necessário factory reset do dispositivo.
