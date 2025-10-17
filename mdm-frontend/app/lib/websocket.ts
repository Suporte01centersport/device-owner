import { useEffect, useState, useRef, useCallback } from 'react';
import { useHttpFallback } from './http-fallback';
import { useMessageQueue } from './message-queue';

// Detectar automaticamente o host correto para WebSocket
const getWebSocketURL = () => {
  if (typeof window === 'undefined') return 'ws://localhost:3002';
  
  // Se há variável de ambiente configurada, usar ela
  if (process.env.NEXT_PUBLIC_WEBSOCKET_URL) {
    return process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  }
  
  // Detectar automaticamente baseado no hostname
  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  // Se for localhost/127.0.0.1, sempre usar localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:3002';
  }
  
  // Para qualquer outro host (IP ou domínio), usar o mesmo host
  // Extrair apenas hostname (sem porta se houver)
  const wsHost = hostname;
  return `${protocol}//${wsHost}:3002`;
};

const WEBSOCKET_URL = getWebSocketURL();
const MAX_RECONNECT_ATTEMPTS = 20; // Aumentado para mais persistência
const INITIAL_RECONNECT_DELAY = 2000; // 2 segundos - mais conservador
const MAX_RECONNECT_DELAY = 30000; // 30 segundos
const HEARTBEAT_INTERVAL = 30000; // 30 segundos - sincronizado com servidor
const FALLBACK_DELAY = 30000; // 30 segundos para ativar fallback - menos agressivo

export const useWebSocket = (onMessage: (message: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'fallback'>('connecting');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const onMessageRef = useRef(onMessage);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const lastSuccessfulConnectionRef = useRef<number>(0);

  // Integrar com fallback HTTP
  const httpFallback = useHttpFallback(onMessage);

  // Função de envio que será usada pela fila
  const sendMessageFunction = useCallback(async (message: any): Promise<boolean> => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Erro ao enviar mensagem via WebSocket:', error);
        return false;
      }
    } else if (connectionStatus === 'fallback' || !isConnected) {
      const result = await httpFallback.sendMessage(message);
      return result.success;
    }
    return false;
  }, [socket, connectionStatus, isConnected, httpFallback]);

  // Integrar com fila de mensagens
  const messageQueue = useMessageQueue(sendMessageFunction);

  // Atualiza a referência da função onMessage sem causar re-render
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const clearFallbackTimeout = useCallback(() => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
  }, []);

  const scheduleFallback = useCallback(() => {
    clearFallbackTimeout();
    fallbackTimeoutRef.current = setTimeout(() => {
      if (!isConnected && shouldReconnectRef.current) {
        console.log('Ativando fallback HTTP...');
        setConnectionStatus('fallback');
        httpFallback.startPolling();
      }
    }, FALLBACK_DELAY);
  }, [isConnected, httpFallback, clearFallbackTimeout]);

  const startHeartbeat = useCallback((ws: WebSocket) => {
    clearHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        }));
      }
    }, HEARTBEAT_INTERVAL);
  }, [clearHeartbeat]);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    
    // Evitar múltiplas conexões simultâneas
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      console.log('Conexão já em andamento, ignorando nova tentativa');
      return;
    }

    setConnectionStatus('connecting');
    console.log(`Tentando conectar ao WebSocket... (tentativa ${reconnectAttempts + 1})`);

    try {
      const ws = new WebSocket(WEBSOCKET_URL);

      ws.onopen = () => {
        console.log('WebSocket conectado com sucesso');
        setIsConnected(true);
        setConnectionStatus('connected');
        setReconnectAttempts(0);
        lastSuccessfulConnectionRef.current = Date.now();
        clearFallbackTimeout();
        httpFallback.stopPolling();
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Responder ao pong do servidor
          if (message.type === 'pong') {
            console.log('Heartbeat recebido do servidor');
            return;
          }
          
          onMessageRef.current(message);
        } catch (error) {
          console.error('Erro ao processar mensagem WebSocket:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket desconectado:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        clearHeartbeat();
        
        // Tentar reconectar se não foi fechado intencionalmente
        if (shouldReconnectRef.current && event.code !== 1000) {
          scheduleReconnect();
          scheduleFallback();
        }
      };

      ws.onerror = (error) => {
        console.error('Erro no WebSocket:', error);
        setConnectionStatus('disconnected');
      };

      setSocket(ws);
    } catch (error) {
      console.error('Erro ao criar conexão WebSocket:', error);
      setConnectionStatus('disconnected');
      scheduleReconnect();
    }
  }, [reconnectAttempts, startHeartbeat, clearHeartbeat, clearFallbackTimeout, httpFallback, socket]);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('Máximo de tentativas de reconexão atingido');
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('reconnecting');
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    console.log(`Tentando reconectar em ${delay}ms...`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
      // Usar uma referência para evitar dependência circular
      if (shouldReconnectRef.current) {
        connect();
      }
    }, delay);
  }, [reconnectAttempts]); // Removido connect das dependências

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearHeartbeat();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.close(1000, 'Component unmounting');
      }
    };
  }, []); // Executar apenas uma vez

  const sendMessage = useCallback(async (message: any, priority: 'high' | 'normal' | 'low' = 'normal') => {
    // Determinar prioridade baseada no tipo de mensagem
    if (message.type === 'ping' || message.type === 'pong') {
      priority = 'high';
    } else if (message.type === 'request_location') {
      priority = 'high';
    }

    // Se conectado, tentar enviar imediatamente
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Erro ao enviar mensagem via WebSocket, adicionando à fila:', error);
        // Adicionar à fila para retry
        const messageId = messageQueue.queueMessage(message, priority);
        return { queued: true, messageId };
      }
    } else {
      // Adicionar à fila para processamento posterior
      const messageId = messageQueue.queueMessage(message, priority);
      console.log(`Mensagem adicionada à fila: ${messageId}`);
      return { queued: true, messageId };
    }
  }, [socket, messageQueue]);

  const forceReconnect = useCallback(() => {
    console.log('Forçando reconexão...');
    shouldReconnectRef.current = true;
    setReconnectAttempts(0);
    clearFallbackTimeout();
    httpFallback.stopPolling();
    
    if (socket) {
      socket.close();
    }
    connect();
  }, [socket, connect, clearFallbackTimeout, httpFallback]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      clearFallbackTimeout();
      httpFallback.stopPolling();
    };
  }, [clearFallbackTimeout, httpFallback]);

  return { 
    isConnected, 
    connectionStatus, 
    sendMessage, 
    forceReconnect,
    reconnectAttempts,
    isPolling: httpFallback.isPolling,
    pollingAttempts: httpFallback.pollingAttempts,
    queueStatus: messageQueue.getQueueStatus(),
    clearQueue: messageQueue.clearQueue
  };
};