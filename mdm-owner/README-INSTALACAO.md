# 🚀 MDM Launcher - Instalação e Configuração

## ⚡ COMANDOS RÁPIDOS

### Desenvolvimento (Debug)
```bash
cd mdm-owner
.\install-debug.bat
```
→ Compila, instala e conecta no **servidor Windows** (`192.168.2.46:3002`)

### Produção (Release)
```bash
cd mdm-owner
.\install-release.bat
```
→ Instala, configura Device Owner e conecta no **servidor Linux** (`192.168.2.100:3002`)

---

## 📱 Instalação Manual - Release + Device Owner

```bash
cd C:\Desenvolvimento\device-owner\mdm-owner

# 1. Remover Device Owner anterior
adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver

# 2. Desinstalar versão anterior
adb uninstall com.mdm.launcher

# 3. Instalar APK Release
adb install app\build\outputs\apk\release\app-release.apk

# 4. Configurar Device Owner
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

✅ **Pronto!** Conecta em `192.168.2.100:3002` (Linux)

---

## 🔨 Compilar APKs

```bash
# Debug (servidor Windows - descoberta automática)
.\gradlew.bat assembleDebug

# Release (servidor Linux - IP fixo 192.168.2.100)
.\gradlew.bat assembleRelease
```

---

## 🌐 Configuração de Servidores

| Build | Servidor | IP | Descoberta |
|-------|----------|-----|-----------|
| **Debug** | Windows | `192.168.2.46:3002` | Automática |
| **Release** | Linux | `192.168.2.100:3002` | IP Fixo |

### Mudar IP do Servidor Linux

Edite `app/build.gradle` linha 27:
```gradle
buildConfigField "String", "SERVER_URL", '"ws://SEU_IP:3002"'
```

---

## ⚠️ Device Owner - Requisitos

- ✅ Dispositivo **sem contas Google**
- ✅ **Apenas 1 usuário** (usuário 0)  
- ✅ Preferencialmente **resetado de fábrica**

### Verificar/Corrigir Usuários
```bash
# Ver usuários
adb shell pm list users

# Remover extras (manter só UserInfo{0:Owner:...})
adb shell pm remove-user <ID>
```

---

## 🔍 Verificar Status

```bash
# Confirmar Device Owner
adb shell dpm list-owners

# Ver qual servidor conectou
adb logcat -s ServerDiscovery:D -t 10 | findstr "URL"

# Ver conexão WebSocket
adb logcat -s WebSocketClient:D -t 10 | findstr "ABERTO"
```

---

## 🐛 Problemas Comuns

### "Already several users on device"
```bash
adb shell pm list users
adb shell pm remove-user <ID>
```

### "DELETE_FAILED_INTERNAL_ERROR"
```bash
# Remover Device Owner PRIMEIRO
adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver
adb uninstall com.mdm.launcher
```

### APK conecta no servidor errado
```bash
# Reinstalar completamente
adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver
adb uninstall com.mdm.launcher
adb install app\build\outputs\apk\release\app-release.apk
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

---

## 🎯 Configuração Implementada

**Arquivo**: `app/build.gradle`

```gradle
buildTypes {
    release {
        // URL FIXA - Servidor Linux
        buildConfigField "String", "SERVER_URL", '"ws://192.168.2.100:3002"'
        buildConfigField "Boolean", "USE_FIXED_SERVER", "true"
    }
    debug {
        // Descoberta automática - Servidor Windows
        buildConfigField "String", "SERVER_URL", '""'
        buildConfigField "Boolean", "USE_FIXED_SERVER", "false"
    }
}
```

---

## ✅ Pronto!

Use **`.\install-debug.bat`** ou **`.\install-release.bat`** e pronto! 🚀

