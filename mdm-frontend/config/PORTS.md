# Portas do MDM

| Porta | Serviço        | Uso                          |
| ----- | -------------- | ---------------------------- |
| 3000  | Next.js        | Frontend web                 |
| 3001  | WebSocket      | Servidor de dispositivos     |
| 3002  | **Não usada**  | Removida – use 3001          |

## Scripts

- `npm run dev` – Next.js em localhost (mais rápido)
- `npm run dev:network` – Next.js acessível na rede (0.0.0.0)
- `npm run dev:all` – WebSocket + Next.js (localhost)
- `npm run dev:all:network` – WebSocket + Next.js (acessível na rede)
