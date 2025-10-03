# 🧪 Teste de Mudança de Apps na Web

## 📋 Como Testar

### 1. **Verificar Conexão**
- ✅ Dispositivo Android conectado
- ✅ Interface web funcionando
- ✅ Mensagens sendo enviadas/recebidas

### 2. **Testar Mudança de Apps**

#### **Passo 1: Abrir Modal do Dispositivo**
1. Na interface web, clique no dispositivo
2. Clique no botão "Configurar" ou "Apps"
3. Deve abrir o modal de configuração

#### **Passo 2: Modificar Apps Permitidos**
1. Na seção "Apps Permitidos"
2. Marque/desmarque alguns apps
3. Clique em "Salvar Permissões"

#### **Passo 3: Verificar Logs do Servidor**
No terminal do servidor, deve aparecer:
```
=== UPDATE APP PERMISSIONS RECEBIDO ===
DeviceId: [seu_device_id]
AllowedApps: [lista_de_apps]
Tipo de dados: object
É array? true
=====================================

=== DADOS ATUALIZADOS NO DISPOSITIVO ===
DeviceId: [seu_device_id]
AllowedApps atualizados: [lista_de_apps]
========================================

=== ENVIANDO MENSAGEM PARA ANDROID ===
DeviceId: [seu_device_id]
Mensagem: {
  "type": "update_app_permissions",
  "data": {
    "allowedApps": [lista_de_apps]
  },
  "timestamp": [timestamp]
}
WebSocket estado: 1
=====================================
```

#### **Passo 4: Verificar Logs do Android**
No Android Studio ou `adb logcat`, procure por:
```
=== DEBUG: update_app_permissions recebido ===
Data recebida: {allowedApps=[lista_de_apps]}
Apps permitidos recebidos: [lista_de_apps]
Apps permitidos processados: [número] apps
Lista de apps permitidos: [lista_de_apps]
Apps list atualizada no launcher
```

#### **Passo 5: Verificar Mudança no Launcher**
1. No dispositivo Android, volte para o launcher
2. Os apps devem aparecer/desaparecer conforme configurado
3. Apenas os apps permitidos devem estar visíveis

## 🔍 Possíveis Problemas

### **Problema 1: Modal não abre**
- Verificar se o dispositivo está conectado
- Verificar se há erros no console do navegador

### **Problema 2: Apps não mudam no Android**
- Verificar logs do servidor (deve mostrar envio da mensagem)
- Verificar logs do Android (deve mostrar recebimento)
- Verificar se o `deviceId` está correto

### **Problema 3: Apps não aparecem na lista**
- Verificar se o dispositivo enviou a lista de apps instalados
- Verificar se `installedApps` não está vazio

## 📱 Logs Importantes

### **Servidor (Terminal)**
- `=== UPDATE APP PERMISSIONS RECEBIDO ===`
- `=== ENVIANDO MENSAGEM PARA ANDROID ===`

### **Android (Logcat)**
- `=== DEBUG: update_app_permissions recebido ===`
- `Apps permitidos processados: X apps`
- `Apps list atualizada no launcher`

### **Web (Console do Navegador)**
- `Permissões salvas com sucesso!`
- `Permissões de aplicativos atualizadas:`

## 🎯 Resultado Esperado

1. ✅ Modal abre na web
2. ✅ Apps são marcados/desmarcados
3. ✅ Permissões são salvas
4. ✅ Mensagem é enviada para Android
5. ✅ Android recebe e processa a mensagem
6. ✅ Launcher atualiza a lista de apps
7. ✅ Apenas apps permitidos ficam visíveis

## 🚨 Se Não Funcionar

1. **Verificar todos os logs** acima
2. **Confirmar que o deviceId** é o mesmo em todos os lugares
3. **Verificar se o WebSocket** está conectado (estado 1)
4. **Testar com um app simples** primeiro
5. **Reiniciar o app Android** se necessário
