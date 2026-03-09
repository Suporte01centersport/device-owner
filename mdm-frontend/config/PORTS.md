# Portas do MDM

| Porta | Serviço        | Uso                          |
| ----- | -------------- | ---------------------------- |
| 3000  | Next.js        | Frontend web                 |
| 3001  | WebSocket      | Servidor de dispositivos     |
| 3002  | **Não usada**  | Removida – use 3001          |

## Celular não aparece na web? (mesma rede WiFi)

1. Descubra o IP do PC: `ipconfig` (procure IPv4 na interface Wi-Fi, ex: 192.168.2.83)
2. No `.env.development`, adicione: `WEBSOCKET_CLIENT_HOST=192.168.2.83` (seu IP)
3. Reinicie o backend e faça add-device de novo (ou no app: chave inglesa > Setup > URL do servidor)

## Scripts

- `npm run dev` – Next.js em localhost (mais rápido)
- `npm run dev:network` – Next.js acessível na rede (0.0.0.0)
- `npm run dev:all` – WebSocket + Next.js (localhost)
- `npm run dev:all:network` – WebSocket + Next.js (acessível na rede)
