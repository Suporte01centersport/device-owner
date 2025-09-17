@echo off
echo ========================================
echo   MDM Owner - Modo Desenvolvimento
echo ========================================
echo.

echo [1/3] Instalando dependencias...
call npm install

echo.
echo [2/3] Iniciando servidor WebSocket...
start "WebSocket Server" cmd /k "node server/websocket.js"

echo.
echo [3/3] Iniciando painel web...
echo.
echo ✅ Servidor rodando em: http://localhost:3000
echo ✅ WebSocket rodando em: ws://localhost:3002
echo.
echo Pressione Ctrl+C para parar
echo.

call npm run dev
