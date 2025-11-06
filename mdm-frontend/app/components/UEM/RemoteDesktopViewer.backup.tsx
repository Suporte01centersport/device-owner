'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Computer } from '../../types/uem'

interface RemoteDesktopViewerProps {
  computer: Computer
  sessionId: string
  onClose: () => void
  websocket?: WebSocket
}

export default function RemoteDesktopViewer({ 
  computer, 
  sessionId, 
  onClose,
  websocket 
}: RemoteDesktopViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scale, setScale] = useState(1.0)
  const [autoFit, setAutoFit] = useState(true) // Ajustar automaticamente ao viewport
  const [error, setError] = useState<string | null>(null)
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false)
  const [sessionActive, setSessionActive] = useState(false) // Flag para indicar se a sessão está ativa
  const wsRef = useRef<WebSocket | null>(null) // WebSocket apenas para sinalização e frames
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null) // WebRTC PeerConnection
  const dataChannelRef = useRef<RTCDataChannel | null>(null) // RTCDataChannel para comandos de input
  const dataChannelLoggedRef = useRef(false) // Flag para rastrear se já logamos a mensagem de espera
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isLocalTest, setIsLocalTest] = useState(false) // Detectar se é teste local
  const [remoteScreenSize, setRemoteScreenSize] = useState<{ width: number; height: number } | null>(null)
  const hasAutoAdjustedRef = useRef(false) // Flag para garantir que só ajuste automaticamente uma vez
  const lastMouseMoveTimeRef = useRef(0) // Para throttling do movimento do mouse
  const canvasFocusRef = useRef(false) // Para controlar foco do canvas
  const lastMouseDownRef = useRef<{ x: number; y: number; button: string } | null>(null) // Armazenar posição do último mouse down

  // Mapeamento de teclas JavaScript para códigos Windows Virtual Key
  const keyCodeMap: Record<string, number> = {
    'Enter': 0x0D,
    'Escape': 0x1B,
    'Backspace': 0x08,
    'Tab': 0x09,
    'Shift': 0x10,
    'Control': 0x11,
    'Alt': 0x12,
    'Meta': 0x5B, // Windows key
    'Space': 0x20,
    'ArrowUp': 0x26,
    'ArrowDown': 0x28,
    'ArrowLeft': 0x25,
    'ArrowRight': 0x27,
    'Delete': 0x2E,
    'Insert': 0x2D,
    'Home': 0x24,
    'End': 0x23,
    'PageUp': 0x21,
    'PageDown': 0x22,
    'CapsLock': 0x14,
    'NumLock': 0x90,
    'ScrollLock': 0x91,
    'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
    'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
    'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B
  }

  useEffect(() => {
    // Resetar flag quando mudar de sessão
    hasAutoAdjustedRef.current = false
    
    if (!sessionId) {
      return
    }
    
    // Flag para controlar se o componente ainda está montado
    let isMounted = true
    
    // Usar WebSocket fornecido ou criar novo
    // Usar a mesma porta do servidor Next.js se estiver em desenvolvimento, ou porta 3002 para produção
    const wsUrl = websocket 
      ? null 
      : (typeof window !== 'undefined' 
          ? `ws://${window.location.hostname}:3002`
          : 'ws://localhost:3002')
    
    let ws: WebSocket | null = null
    
    // Só criar WebSocket se não foi fornecido via props
    if (!websocket && wsUrl) {
      try {
        ws = new WebSocket(wsUrl)
        wsRef.current = ws
      } catch (error) {
        console.error('❌ Erro ao criar WebSocket:', error)
        if (isMounted) {
          setError('Não foi possível criar conexão WebSocket')
        }
        return
      }
    } else if (websocket) {
      ws = websocket
      wsRef.current = ws
    }
    
    if (!ws) {
      if (isMounted) {
        setError('Não foi possível criar conexão WebSocket')
      }
      return
    }

    // Função para registrar sessão (desktop normal)
    const registerSession = () => {
      const currentWs = wsRef.current
      if (!sessionId || !currentWs || currentWs.readyState !== WebSocket.OPEN) {
        return
      }
      
      const registerMessage = {
        type: 'register_desktop_session',
        sessionId: sessionId,
        computerId: computer.computerId
      }
      
      try {
        currentWs.send(JSON.stringify(registerMessage))
      } catch (error) {
        // Silenciosamente ignorar erros de envio
      }
    }

    // Função para registrar sessão WebRTC (para Data Channel)
    const registerWebRTCSession = () => {
      const currentWs = wsRef.current
      if (!sessionId || !currentWs || currentWs.readyState !== WebSocket.OPEN) {
        return
      }
      
      const registerMessage = {
        type: 'register_webrtc_session',
        sessionId: sessionId,
        computerId: computer.computerId
      }
      
      try {
        currentWs.send(JSON.stringify(registerMessage))
        console.log(`📤 Registrando sessão WebRTC: ${sessionId}`)
      } catch (error) {
        console.error('❌ Erro ao registrar sessão WebRTC:', error)
      }
    }

    // Inicializar WebRTC e RTCDataChannel para enviar comandos de input
    if (typeof window !== 'undefined' && 'RTCPeerConnection' in window) {
      try {
        // Configuração WebRTC
        const configuration: RTCConfiguration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }

        // Criar RTCPeerConnection
        const pc = new RTCPeerConnection(configuration)
        peerConnectionRef.current = pc

        // Criar RTCDataChannel para comandos de input (conforme arquitetura)
        const dataChannel = pc.createDataChannel('input', {
          ordered: true
        })
        dataChannelRef.current = dataChannel

        dataChannel.onopen = () => {
          console.log('✅ RTCDataChannel aberto para comandos de input')
          dataChannelLoggedRef.current = false // Reset flag quando abrir
        }

        dataChannel.onerror = (error) => {
          console.error('❌ Erro no RTCDataChannel:', error)
        }

        dataChannel.onclose = () => {
          console.log('⚠️ RTCDataChannel fechado')
        }

        // Configurar handlers WebRTC
        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'webrtc_ice_candidate',
              sessionId: sessionId,
              candidate: event.candidate,
              computerId: computer.computerId
            }))
          }
        }

        pc.onconnectionstatechange = () => {
          console.log('📡 Estado da conexão WebRTC:', pc.connectionState)
          if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') {
            // Conexão WebRTC estabelecida ou em processo
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.warn('⚠️ Conexão WebRTC perdida, usando WebSocket como fallback')
          }
        }

        // Criar offer para estabelecer conexão WebRTC
        // Isso será feito após registrar a sessão WebRTC
        const createWebRTCOffer = async () => {
          try {
            // Primeiro registrar a sessão WebRTC
            registerWebRTCSession()
            
            // Aguardar um pouco antes de criar o offer
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const offer = await pc.createOffer({
              offerToReceiveVideo: false, // Não precisamos receber vídeo via WebRTC (usamos WebSocket para frames)
              offerToReceiveAudio: false
            })
            await pc.setLocalDescription(offer)
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'webrtc_offer',
                sessionId: sessionId,
                offer: offer,
                computerId: computer.computerId
              }))
              console.log('📤 WebRTC Offer enviado para estabelecer Data Channel')
            }
          } catch (error) {
            console.error('❌ Erro ao criar WebRTC offer:', error)
          }
        }

        // Armazenar função para chamar depois
        // @ts-ignore
        ws._createWebRTCOffer = createWebRTCOffer
      } catch (error) {
        console.error('❌ Erro ao inicializar WebRTC:', error)
        // Continuar sem WebRTC, usando apenas WebSocket
      }
    }

    // Handler para mensagens recebidas
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'desktop_frame') {
          // Aceitar frames de qualquer sessão para este computador
          // (pode haver múltiplas sessões, mas queremos exibir qualquer frame que chegue)
          if (message.sessionId && message.frame) {
            if (!hasReceivedFrame) {
              setHasReceivedFrame(true)
            }
            // Se recebemos frames, a sessão está ativa
            if (!sessionActive) {
              setSessionActive(true)
              console.log('✅ Sessão de desktop remoto confirmada como ativa (recebendo frames)')
            }
            displayFrame(message.frame)
          }
        } else if (message.type === 'session_active' && message.sessionId === sessionId) {
          // Confirmação explícita de que a sessão está ativa
          setSessionActive(true)
          console.log('✅ Sessão de desktop remoto confirmada como ativa')
        } else if (message.type === 'webrtc_answer' && message.sessionId === sessionId) {
          // Receber answer WebRTC do agente
          const pc = peerConnectionRef.current
          if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(message.answer))
              .then(() => {
                console.log('✅ WebRTC Answer recebido, Data Channel estabelecido')
              })
              .catch((error) => {
                console.error('❌ Erro ao processar WebRTC answer:', error)
              })
          }
        } else if (message.type === 'webrtc_ice_candidate' && message.sessionId === sessionId) {
          // Receber ICE candidate do agente
          const pc = peerConnectionRef.current
          if (pc && message.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(message.candidate))
              .catch((error) => {
                console.error('❌ Erro ao adicionar ICE candidate:', error)
              })
          }
        }
      } catch (error) {
        // Silenciosamente ignorar erros ao processar mensagens
      }
    }

    // Se o WebSocket já está conectado (readyState === 1), registrar imediatamente
    if (ws.readyState === WebSocket.OPEN) {
      if (isMounted) {
        setIsConnected(true)
      }
      
      // Adicionar handler de mensagens usando addEventListener para não sobrescrever
      // Isso permite múltiplos handlers
      const messageHandler = (event: MessageEvent) => {
        if (isMounted) {
          handleMessage(event)
        }
      }
      ws.addEventListener('message', messageHandler)
      
      // Armazenar referência para poder remover depois
      // @ts-ignore - armazenar handler customizado
      ws._remoteDesktopHandler = messageHandler
      
      // Registrar sessão imediatamente
      setTimeout(() => {
        if (isMounted) {
          registerSession()
          // Tentar estabelecer conexão WebRTC após registrar sessão
          // @ts-ignore
          if (ws._createWebRTCOffer) {
            setTimeout(() => {
              // @ts-ignore
              ws._createWebRTCOffer()
            }, 500)
          }
        }
      }, 500) // Pequeno delay para garantir que o servidor processou o web_client
    } else {
      // Se não está conectado, aguardar o evento onopen
      const onOpenHandler = () => {
        if (!isMounted) return
        
        const currentWs = wsRef.current
        if (!currentWs) return
        
        setIsConnected(true)
        
        // Registrar como cliente web primeiro
        if (currentWs.readyState === WebSocket.OPEN) {
          try {
            currentWs.send(JSON.stringify({ type: 'web_client' }))
          } catch (error) {
            console.error('❌ Erro ao registrar como web_client:', error)
          }
        }
        
        // Configurar handler de mensagens
        currentWs.onmessage = handleMessage
        
        // Depois registrar sessão no servidor (isso vai iniciar a captura no agente)
        setTimeout(() => {
          if (isMounted) {
            registerSession()
            // Tentar estabelecer conexão WebRTC após registrar sessão
            // @ts-ignore
            if (currentWs._createWebRTCOffer) {
              setTimeout(() => {
                // @ts-ignore
                currentWs._createWebRTCOffer()
              }, 500)
            }
          }
        }, 1000) // Delay para garantir que o cliente foi registrado
      }
      
      ws.onopen = onOpenHandler
      
      // Configurar handlers de erro e close apenas se não for websocket fornecido
      if (!websocket) {
        ws.onerror = (error) => {
          if (isMounted) {
            console.error('❌ Erro de conexão WebSocket:', error)
            setError('Erro de conexão com o servidor WebSocket')
          }
        }

        ws.onclose = (event) => {
          if (isMounted) {
            setIsConnected(false)
            // Só mostrar erro se não foi um fechamento normal
            if (event.code !== 1000 && event.code !== 1001) {
              console.warn('⚠️ WebSocket fechado inesperadamente:', event.code, event.reason)
            }
          }
        }
      }
    }

    // A sessão já foi iniciada via RemoteAccessModal, apenas aguardar frames

    return () => {
      // Marcar como desmontado
      isMounted = false
      
      // Remover handler de mensagens se foi adicionado
      if (wsRef.current) {
        // @ts-ignore - verificar se handler customizado existe
        if (wsRef.current._remoteDesktopHandler) {
          // @ts-ignore
          wsRef.current.removeEventListener('message', wsRef.current._remoteDesktopHandler)
        }
      }
      
      // Parar sessão ao fechar
      const stopSession = async () => {
        try {
          await fetch('/api/uem/remote/desktop/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sessionId: sessionId,
              computerId: computer.computerId 
            })
          })
        } catch (err) {
          // Silenciosamente ignorar erros ao parar sessão
        }
      }
      
      stopSession()
      
      // Fechar RTCDataChannel e RTCPeerConnection
      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close()
        } catch (error) {
          // Ignorar erros
        }
        dataChannelRef.current = null
      }
      
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close()
        } catch (error) {
          // Ignorar erros
        }
        peerConnectionRef.current = null
      }
      
      // Fechar WebSocket apenas se foi criado por este componente (não fornecido via props)
      // E apenas se estiver em um estado válido para fechar
      if (!websocket && wsRef.current) {
        const currentWs = wsRef.current
        // Verificar se o WebSocket está em um estado que pode ser fechado
        if (currentWs.readyState === WebSocket.CONNECTING || currentWs.readyState === WebSocket.OPEN) {
          try {
            // Remover handlers antes de fechar para evitar erros
            currentWs.onopen = null
            currentWs.onerror = null
            currentWs.onclose = null
            currentWs.onmessage = null
            currentWs.close(1000, 'Component unmounting')
          } catch (error) {
            // Ignorar erros ao fechar (pode já estar fechado)
          }
        }
        wsRef.current = null
      }
    }
  }, [sessionId, computer.computerId, websocket]) // sessionId está nas dependências

  const displayFrame = useCallback((base64Frame: string) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Criar imagem a partir do base64
    const img = new Image()
    img.onerror = (error) => {
      // Silenciosamente ignorar erros ao carregar frames
    }
    img.onload = () => {
      try {
        // Atualizar tamanho da tela remota
        if (!remoteScreenSize || remoteScreenSize.width !== img.width || remoteScreenSize.height !== img.height) {
          setRemoteScreenSize({ width: img.width, height: img.height })
        }
        
        // Ajustar tamanho do canvas (mantém proporção)
        canvas.width = img.width
        canvas.height = img.height
        
        // Limpar canvas antes de desenhar
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // Desenhar frame
        ctx.drawImage(img, 0, 0)
        
        // Atualizar referência da imagem
        imageRef.current = img
        
        // Ajustar escala automaticamente apenas uma vez quando o primeiro frame chega
        // NÃO ajustar a cada frame para evitar resetar o zoom manual do usuário
        // A flag hasAutoAdjustedRef impede múltiplas chamadas
        if (autoFit && containerRef.current && !hasAutoAdjustedRef.current) {
          // Ajuste automático será aplicado uma vez (sem log)
          // Usar requestAnimationFrame para garantir que o DOM está atualizado
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (containerRef.current && imageRef.current && !hasAutoAdjustedRef.current) {
                adjustScaleToFit() // Esta função vai setar a flag internamente
              }
            }, 100)
          })
        }
        // Se já ajustou, não fazer nada (silenciosamente ignorar)
        
      } catch (error) {
        // Silenciosamente ignorar erros ao desenhar frames
      }
    }
    
    // Verificar se base64Frame é válido
    if (!base64Frame || base64Frame.length === 0) {
      return
    }
    
    img.src = `data:image/jpeg;base64,${base64Frame}`
  }, [])

  // Função para enviar comandos via RTCDataChannel (preferencial) ou WebSocket (fallback)
  const sendInputCommand = useCallback((command: { action: string; params: any }) => {
    // Verificar se a sessão está ativa antes de enviar comandos de controle remoto
    // Permitir movimento do mouse mesmo sem confirmação explícita (pode ajudar na inicialização)
    if (command.action.startsWith('remote_') && command.action !== 'remote_mouse_move') {
      if (!sessionActive && !hasReceivedFrame) {
        // Sessão ainda não está ativa, aguardar um pouco
        console.warn(`⏳ Sessão ainda não está ativa, aguardando antes de enviar: ${command.action}`)
        // Retornar false mas não bloquear completamente - pode ser que a sessão esteja sendo iniciada
        // Os comandos serão enviados quando a sessão estiver ativa
        return false
      }
    }
    
    // Tentar usar RTCDataChannel primeiro (conforme arquitetura WebRTC)
    const dataChannel = dataChannelRef.current
    if (dataChannel) {
      if (dataChannel.readyState === 'open') {
        try {
          const message = JSON.stringify(command)
          dataChannel.send(message)
          // Log apenas para cliques e ações importantes (não para movimento)
          if (command.action !== 'remote_mouse_move') {
            console.log(`📤 Comando enviado via RTCDataChannel: ${command.action}`, command.params)
          }
          return true
        } catch (error) {
          console.error('❌ Erro ao enviar comando via RTCDataChannel:', error)
          // Fallback para WebSocket
        }
      } else {
        // Data Channel existe mas não está aberto ainda
        // Log apenas uma vez para não poluir o console
        if (command.action !== 'remote_mouse_move' && !dataChannelLoggedRef.current) {
          console.log(`⏳ RTCDataChannel ainda não está aberto (estado: ${dataChannel.readyState}), usando WebSocket como fallback`)
          dataChannelLoggedRef.current = true
        }
      }
    }
    
    // Fallback: usar WebSocket se RTCDataChannel não estiver disponível
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const message = {
          type: 'uem_remote_action',
          computerId: computer.computerId,
          action: command.action,
          params: command.params,
          timestamp: Date.now()
        }
        ws.send(JSON.stringify(message))
        if (command.action !== 'remote_mouse_move') {
          console.log(`📤 Comando enviado via WebSocket (fallback): ${command.action}`, command.params)
        }
        return true
      } catch (error) {
        console.error('❌ Erro ao enviar comando via WebSocket:', error)
      }
    } else {
      if (command.action !== 'remote_mouse_move') {
        console.warn(`⚠️ WebSocket não disponível para enviar comando: ${command.action}`)
      }
    }
    
    return false
  }, [computer.computerId, sessionActive, hasReceivedFrame])

  const sendMouseEvent = useCallback((action: string, x: number, y: number, button: string = 'left', delta?: number) => {
    const canvas = canvasRef.current
    const image = imageRef.current
    
    // Verificar se canvas e imagem estão disponíveis
    if (!canvas) {
      // Canvas ainda não está montado, ignorar silenciosamente
      return
    }
    
    if (!image) {
      // Imagem ainda não foi carregada, ignorar silenciosamente
      return
    }

    // Calcular coordenadas reais baseadas no canvas e na escala
    const rect = canvas.getBoundingClientRect()
    
    // Considerar o scale aplicado ao canvas
    const scaledWidth = rect.width / scale
    const scaledHeight = rect.height / scale
    
    // Calcular posição relativa ao canvas escalado
    const canvasX = (x - rect.left) / scale
    const canvasY = (y - rect.top) / scale
    
    // Calcular coordenadas reais da tela remota
    const scaleX = image.width / scaledWidth
    const scaleY = image.height / scaledHeight
    
    const realX = Math.round(canvasX * scaleX)
    const realY = Math.round(canvasY * scaleY)
    
    // Garantir que as coordenadas estão dentro dos limites
    const finalX = Math.max(0, Math.min(realX, image.width - 1))
    const finalY = Math.max(0, Math.min(realY, image.height - 1))

    // Construir params baseado na ação
    const params: any = { 
      x: finalX, 
      y: finalY
    }
    
    // Adicionar button apenas para ações que precisam (down, up, click)
    if (button && (action === 'remote_mouse_down' || action === 'remote_mouse_up' || action === 'remote_mouse_click')) {
      params.button = button
    }
    
    // Adicionar delta apenas para scroll
    if (delta !== undefined && action === 'remote_mouse_scroll') {
      params.delta = delta
    }

    // Enviar comando via RTCDataChannel (ou WebSocket como fallback)
    sendInputCommand({
      action: action,
      params: params
    })
  }, [scale, sendInputCommand])

  const sendKeyEvent = useCallback((action: string, keyCode: number) => {
    // Enviar comando via RTCDataChannel (ou WebSocket como fallback)
    sendInputCommand({
      action: action,
      params: { 
        keyCode: keyCode
      }
    })
  }, [sendInputCommand])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePosition({ x, y })
    
    // Throttling: enviar movimento do mouse no máximo a cada 50ms (20 vezes por segundo)
    const now = Date.now()
    if (now - lastMouseMoveTimeRef.current >= 50) {
      lastMouseMoveTimeRef.current = now
      sendMouseEvent('remote_mouse_move', e.clientX, e.clientY)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    // Calcular coordenadas reais e salvar para usar no mouse up
    const canvas = canvasRef.current
    const image = imageRef.current
    if (canvas && image) {
      const rect = canvas.getBoundingClientRect()
      const scaledWidth = rect.width / scale
      const scaledHeight = rect.height / scale
      const canvasX = (e.clientX - rect.left) / scale
      const canvasY = (e.clientY - rect.top) / scale
      const scaleX = image.width / scaledWidth
      const scaleY = image.height / scaledHeight
      const realX = Math.round(canvasX * scaleX)
      const realY = Math.round(canvasY * scaleY)
      const finalX = Math.max(0, Math.min(realX, image.width - 1))
      const finalY = Math.max(0, Math.min(realY, image.height - 1))
      
      // Salvar posição do down para usar no up
      lastMouseDownRef.current = { x: finalX, y: finalY, button }
      
      sendMouseEvent('remote_mouse_down', e.clientX, e.clientY, button)
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    
    // Usar a posição do mouse down se disponível (para garantir que down e up sejam na mesma posição)
    // Isso é importante porque o mouse pode ter se movido entre down e up
    if (lastMouseDownRef.current && lastMouseDownRef.current.button === button) {
      // Usar as coordenadas reais salvas do mouse down
      const canvas = canvasRef.current
      const image = imageRef.current
      if (canvas && image) {
        // Enviar diretamente as coordenadas reais salvas
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          const message = {
            type: 'uem_remote_action',
            computerId: computer.computerId,
            action: 'remote_mouse_up',
            params: { 
              x: lastMouseDownRef.current.x, 
              y: lastMouseDownRef.current.y, 
              button: button
            },
            timestamp: Date.now()
          }
          try {
            ws.send(JSON.stringify(message))
            console.log(`📤 Evento de mouse enviado: remote_mouse_up (${lastMouseDownRef.current.x}, ${lastMouseDownRef.current.y})`)
          } catch (error) {
            console.error('❌ Erro ao enviar evento de mouse:', error)
          }
        }
        lastMouseDownRef.current = null // Limpar após usar
        return
      }
    }
    
    // Fallback: usar posição atual do mouse
    sendMouseEvent('remote_mouse_up', e.clientX, e.clientY, button)
    lastMouseDownRef.current = null
  }

  // Removido handleMouseClick - não é necessário pois down/up já cobre cliques
  // onClick será usado apenas para prevenir propagação

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = e.deltaY > 0 ? -120 : 120
    sendMouseEvent('remote_mouse_wheel', e.clientX, e.clientY, 'middle', delta)
    e.preventDefault()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Permitir ESC para fechar (não enviar para o remoto)
    if (e.key === 'Escape') {
      onClose()
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    // Mapear tecla para código Virtual Key
    let keyCode = keyCodeMap[e.key]
    
    // Se não encontrou no mapa, tentar usar keyCode do evento
    if (!keyCode) {
      keyCode = e.keyCode
    }
    
    // Se ainda não tem, tentar usar charCodeAt para caracteres
    if (!keyCode && e.key.length === 1) {
      const char = e.key.toUpperCase()
      keyCode = char.charCodeAt(0)
    }
    
    if (keyCode) {
      sendKeyEvent('remote_key_down', keyCode)
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Permitir ESC para fechar (não enviar para o remoto)
    if (e.key === 'Escape') {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    // Mapear tecla para código Virtual Key
    let keyCode = keyCodeMap[e.key]
    
    // Se não encontrou no mapa, tentar usar keyCode do evento
    if (!keyCode) {
      keyCode = e.keyCode
    }
    
    // Se ainda não tem, tentar usar charCodeAt para caracteres
    if (!keyCode && e.key.length === 1) {
      const char = e.key.toUpperCase()
      keyCode = char.charCodeAt(0)
    }
    
    if (keyCode) {
      sendKeyEvent('remote_key_up', keyCode)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    // Para caracteres normais, enviar como texto via RTCDataChannel (ou WebSocket como fallback)
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      sendInputCommand({
        action: 'remote_text',
        params: { text: e.key }
      })
    }
  }

  // Ajustar escala para caber no viewport mantendo proporção
  const adjustScaleToFit = useCallback((force = false) => {
    if (!canvasRef.current || !containerRef.current || !imageRef.current) {
      return
    }
    
    // Verificar se já ajustou automaticamente (evitar múltiplas chamadas)
    // Mas permitir se for forçado (como quando clica no botão "Ajustar")
    if (hasAutoAdjustedRef.current && autoFit && !force) {
      // Ajuste automático já foi aplicado, ignorando (sem log)
      return
    }
    
    const container = containerRef.current
    const img = imageRef.current
    
    // Usar todo o espaço disponível (com margem pequena)
    const containerWidth = container.clientWidth - 20 // Margem reduzida
    const containerHeight = container.clientHeight - 20 // Margem reduzida
    
    // Calcular escala para caber completamente mantendo proporção
    const scaleX = containerWidth / img.width
    const scaleY = containerHeight / img.height
    
    // Usar a MENOR escala para garantir que a tela INTEIRA caiba (sem cortar)
    // Não limitar a 1.0 - permitir reduzir se necessário para caber tudo
    const newScale = Math.min(scaleX, scaleY)
    
    // Garantir escala mínima razoável (não deixar muito pequeno)
    const finalScale = Math.max(newScale, 0.1) // Mínimo 10%
    
    setScale(finalScale)
    // Ajuste aplicado (sem log para cada ajuste)
    
    // Marcar como ajustado apenas se for automático (não forçado)
    if (autoFit && !force) {
      hasAutoAdjustedRef.current = true
    }
  }, [autoFit])

  // Ajustar escala quando o tamanho da janela mudar (apenas se autoFit estiver ativo E ainda não ajustou automaticamente)
  useEffect(() => {
    if (!autoFit || !hasReceivedFrame || hasAutoAdjustedRef.current) return
    
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      // Debounce para evitar múltiplos ajustes
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        // Só ajustar se ainda não ajustou automaticamente
        if (!hasAutoAdjustedRef.current) {
          adjustScaleToFit()
          hasAutoAdjustedRef.current = true
        }
      }, 150)
    }
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [autoFit, hasReceivedFrame, adjustScaleToFit])

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const elem = containerRef.current
      if (elem?.requestFullscreen) {
        elem.requestFullscreen()
        setIsFullscreen(true)
        // Ajustar escala após entrar em fullscreen
        setTimeout(() => {
          if (autoFit) adjustScaleToFit()
        }, 100)
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
        setIsFullscreen(false)
        // Ajustar escala após sair de fullscreen apenas se não ajustou automaticamente ainda
        setTimeout(() => {
          if (autoFit && !hasAutoAdjustedRef.current) {
            adjustScaleToFit()
            hasAutoAdjustedRef.current = true
          }
        }, 100)
      }
    }
  }

  const handleZoomIn = () => {
    setAutoFit(false)
    setScale(prev => Math.min(prev + 0.1, 3.0)) // Máximo 300%
  }

  const handleZoomOut = () => {
    setAutoFit(false)
    setScale(prev => Math.max(prev - 0.1, 0.1)) // Mínimo 10%
  }

  const handleZoomFit = () => {
    // Aplicar ajuste forçado (ignora a flag hasAutoAdjustedRef)
    // Isso permite que o usuário reajuste quando quiser
    setAutoFit(false) // Desativar autoFit para evitar ajustes automáticos futuros
    setTimeout(() => {
      adjustScaleToFit(true) // Forçar ajuste (ignora flag)
    }, 50)
  }

  const handleZoomReset = () => {
    setAutoFit(false)
    setScale(1.0)
  }

  // Handler para tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex flex-col z-50"
      onClick={(e) => {
        // Não fechar ao clicar no backdrop - apenas com botão ou ESC
        if (e.target === e.currentTarget) {
          e.stopPropagation()
        }
      }}
    >
      {/* Header */}
      <div 
        className="bg-gray-600 text-white p-4 flex justify-between items-center border-b border-gray-500"
        onClick={(e) => {
          // Não fechar ao clicar na barra - apenas com botão ou ESC
          e.stopPropagation()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Acesso Remoto - {computer.name}</h2>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">{isConnected ? 'Conectado' : 'Desconectado'}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Informações da tela remota */}
          {remoteScreenSize && (
            <div className="text-sm text-gray-400 mr-4">
              {remoteScreenSize.width}x{remoteScreenSize.height}px
            </div>
          )}
          
          {/* Controles de Zoom */}
          {hasReceivedFrame && (
            <div className="flex items-center gap-1 bg-gray-700 rounded px-2 py-1">
              <button
                onClick={handleZoomOut}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm font-medium transition-colors"
                title="Diminuir zoom"
              >
                −
              </button>
              <button
                onClick={handleZoomFit}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-gray-600 text-white hover:bg-gray-500"
                title="Ajustar ao tamanho da tela"
              >
                Ajustar
              </button>
              <span className="px-3 py-1.5 text-sm text-white min-w-[60px] text-center font-medium">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm font-medium transition-colors"
                title="Aumentar zoom"
              >
                +
              </button>
              <button
                onClick={handleZoomReset}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm font-medium transition-colors"
                title="Resetar zoom (100%)"
              >
                ⟲
              </button>
            </div>
          )}
          
          <button
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded font-medium transition-colors"
          >
            {isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden bg-black flex items-center justify-center relative outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onKeyPress={handleKeyPress}
        onClick={(e) => {
          // Não fechar ao clicar na área do canvas
          e.stopPropagation()
          // Focar no container para receber eventos de teclado
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.focus()
            canvasFocusRef.current = true
          }
        }}
        onMouseEnter={(e) => {
          // Focar automaticamente quando o mouse entra na área
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.focus()
            canvasFocusRef.current = true
          }
        }}
        onMouseLeave={() => {
          canvasFocusRef.current = false
        }}
      >
        {error && (
          <div className="bg-red-900 bg-opacity-90 text-white p-6 rounded-lg max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-2">❌ Erro de Conexão</h3>
            <p className="mb-4">{error}</p>
            <div className="text-sm space-y-2">
              <p><strong>Para resolver:</strong></p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Certifique-se de que o servidor WebSocket está rodando</li>
                <li>Execute: <code className="bg-black bg-opacity-50 px-2 py-1 rounded">npm run websocket</code></li>
                <li>Verifique se a porta 3002 está disponível</li>
                <li>Confirme que o computador remoto está online e conectado</li>
              </ol>
            </div>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-800 rounded"
            >
              Fechar
            </button>
          </div>
        )}
        
        {!isConnected && !error && (
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Conectando ao computador remoto...</p>
            <p className="text-sm text-gray-400 mt-2">Aguardando conexão WebSocket na porta 3002</p>
          </div>
        )}

        {isConnected && !hasReceivedFrame && !error && (
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Aguardando frames do computador remoto...</p>
            <p className="text-sm text-gray-400 mt-2">
              Verifique se o agente está online e recebendo comandos.
              <br />
              Confira o console do agente para ver se está capturando a tela.
            </p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`cursor-crosshair border border-gray-700 shadow-2xl ${hasReceivedFrame ? 'block' : 'hidden'}`}
          style={{ 
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            imageRendering: scale >= 1 ? 'auto' : 'crisp-edges',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
          }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={(e) => {
            // Apenas prevenir propagação - down/up já foram enviados
            e.preventDefault()
            e.stopPropagation()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onWheel={handleWheel}
          onMouseEnter={(e) => e.stopPropagation()}
          onMouseLeave={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // Duplo clique = dois pares de down/up rápidos
            const button = 'left'
            const x = e.clientX
            const y = e.clientY
            sendMouseEvent('remote_mouse_down', x, y, button)
            sendMouseEvent('remote_mouse_up', x, y, button)
            setTimeout(() => {
              sendMouseEvent('remote_mouse_down', x, y, button)
              sendMouseEvent('remote_mouse_up', x, y, button)
            }, 50)
          }}
        />
      </div>
    </div>
  )
}

