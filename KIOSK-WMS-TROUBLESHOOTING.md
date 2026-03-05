# Troubleshooting - WMS tela branca

Se o app WMS (com.centersporti.wmsmobile) abre mas fica com tela branca:

## Possíveis causas e soluções

### 1. App precisa de servidor/URL
O WMS provavelmente é um app WebView que carrega uma URL. Verifique:
- O celular está na mesma rede do servidor do WMS?
- A URL do servidor está configurada corretamente no app?
- O servidor está acessível (não bloqueado por firewall)?

### 2. Permissões
Execute no PC com celular conectado:
```bash
adb shell pm grant com.centersporti.wmsmobile android.permission.READ_EXTERNAL_STORAGE
adb shell pm grant com.centersporti.wmsmobile android.permission.WRITE_EXTERNAL_STORAGE
adb shell appops set com.centersporti.wmsmobile SYSTEM_ALERT_WINDOW allow
```

### 3. Limpar dados do app
```bash
adb shell pm clear com.centersporti.wmsmobile
```
Depois abra o app novamente - ele vai reinicializar.

### 4. Configuração do app
O WMS pode precisar ser configurado na primeira execução com:
- URL do servidor/API
- Usuário e senha
- Outras credenciais

Se a tela branca persistir, entre em contato com o desenvolvedor do WMS para verificar a URL e configuração necessária.
