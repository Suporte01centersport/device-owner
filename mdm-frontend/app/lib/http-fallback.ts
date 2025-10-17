import { useEffect, useState, useRef, useCallback } from 'react';

// Detectar automaticamente o host correto para API HTTP
const getAPIBaseURL = () => {
  if (typeof window === 'undefined') return 'http://localhost:3002/api';
  
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3002/api';
  }
  
  return `${protocol}//${hostname}:3002/api`;
};

const API_BASE_URL = getAPIBaseURL();
const POLLING_INTERVAL = 10000; // 10 segundos
const MAX_POLLING_ATTEMPTS = 10;

export const useHttpFallback = (onMessage: (message: any) => void) => {
  const [isPolling, setIsPolling] = useState(false);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const onMessageRef = useRef(onMessage);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shouldPollRef = useRef(false);

  // Atualiza a referência da função onMessage
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const startPolling = useCallback(() => {
    shouldPollRef.current = true;
    
    if (pollingAttempts < MAX_POLLING_ATTEMPTS) {
      setIsPolling(true);
      
      const poll = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/devices/status`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            
            // Simular mensagem WebSocket
            onMessageRef.current({
              type: 'devices_status',
              devices: data.devices || [],
              serverStats: data.serverStats,
              timestamp: Date.now(),
              source: 'http_fallback'
            });
            
            setPollingAttempts(0); // Reset contador em caso de sucesso
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error) {
          console.error('Erro no polling HTTP:', error);
          setPollingAttempts(prev => prev + 1);
          
          if (pollingAttempts + 1 >= MAX_POLLING_ATTEMPTS) {
            console.log('Máximo de tentativas de polling atingido');
            stopPolling();
          }
        }
      };

      // Executar polling imediatamente
      poll();
      
      // Configurar intervalo
      pollingIntervalRef.current = setInterval(poll, POLLING_INTERVAL);
      
    } else {
      console.log('Fallback HTTP desabilitado - máximo de tentativas atingido');
      stopPolling();
    }
  }, [pollingAttempts]);

  const stopPolling = useCallback(() => {
    shouldPollRef.current = false;
    setIsPolling(false);
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const sendHttpRequest = useCallback(async (endpoint: string, data: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Erro na requisição HTTP:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const sendMessage = useCallback(async (message: any) => {
    // Tentar enviar via HTTP quando WebSocket não estiver disponível
    const endpoint = getEndpointForMessageType(message.type);
    if (endpoint) {
      return await sendHttpRequest(endpoint, message);
    }
    
    console.warn('Tipo de mensagem não suportado no fallback HTTP:', message.type);
    return { success: false, error: 'Tipo de mensagem não suportado' };
  }, [sendHttpRequest]);

  const getEndpointForMessageType = (type: string): string | null => {
    switch (type) {
      default:
        return null;
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isPolling,
    pollingAttempts,
    startPolling,
    stopPolling,
    sendMessage
  };
};
