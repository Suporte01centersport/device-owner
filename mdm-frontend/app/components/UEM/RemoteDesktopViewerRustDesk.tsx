'use client'

/**
 * RemoteDesktopViewer baseado na arquitetura RustDesk
 * 
 * Arquitetura RustDesk:
 * - WebRTC para comunicação em tempo real (vídeo e dados)
 * - RTCDataChannel para comandos de input (mouse/teclado)
 * - WebSocket apenas para sinalização (offer/answer/ICE candidates)
 * - Protocolo de mensagens binário/JSON eficiente
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Computer } from '../../types/uem'

interface RemoteDesktopViewerRustDeskProps {
  computer: Computer
  sessionId: string
  onClose: () => void
  websocket?: WebSocket
}

// Protocolo de mensagens baseado no RustDesk
interface InputMessage {
  type: 'mouse_move' | 'mouse_down' | 'mouse_up' | 'mouse_scroll' | 'key_down' | 'key_up' | 'text'
  x?: number
  y?: number
  button?: 'left' | 'right' | 'middle'
  delta?: number
  keyCode?: number
  text?: string
  modifiers?: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
  }
}

export default function RemoteDesktopViewerRustDesk({ 
  computer, 
  sessionId, 
  onClose,
  websocket 
}: RemoteDesktopViewerRustDeskProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null) // Para vídeo WebRTC (futuro)
  
  // Estados
  const [isConnected, setIsConnected] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scale, setScale] = useState(1.0)
  const [autoFit, setAutoFit] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  
  // Refs para WebRTC (arquitetura RustDesk)
  const wsRef = useRef<WebSocket | null>(null) // Apenas para sinalização
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null) // Para comandos de input
  const videoTrackRef = useRef<MediaStreamTrack | null>(null) // Para vídeo (futuro)
  
  // Refs auxiliares
  const imageRef = useRef<HTMLImageElement | null>(null)
  const lastMouseMoveTimeRef = useRef(0)
  const lastMouseDownRef = useRef<{ x: number; y: number; button: string } | null>(null)
  const hasAutoAdjustedRef = useRef(false)
  const remoteScreenSizeRef = useRef<{ width: number; height: number } | null>(null)

  // Mapeamento de teclas (baseado no RustDesk)
  const keyCodeMap: Record<string, number> = {
    'Enter': 0x0D, 'Escape': 0x1B, 'Backspace': 0x08, 'Tab': 0x09,
    'Shift': 0x10, 'Control': 0x11, 'Alt': 0x12, 'Meta': 0x5B,
    'Space': 0x20,
    'ArrowUp': 0x26, 'ArrowDown': 0x28, 'ArrowLeft': 0x25, 'ArrowRight': 0x27,
    'Delete': 0x2E, 'Insert': 0x2D, 'Home': 0x24, 'End': 0x23,
    'PageUp': 0x21, 'PageDown': 0x22,
    'CapsLock': 0x14, 'NumLock': 0x90, 'ScrollLock': 0x91,
    'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
    'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
    'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B
  }

  // Inicializar WebRTC seguindo arquitetura RustDesk
  useEffect(() => {
    if (!sessionId) return
    
    let isMounted = true
    
    // 1. Configurar WebSocket apenas para sinalização (como RustDesk)
    const wsUrl = websocket 
      ? null 
      : (typeof window !== 'undefined' 
          ? `ws://${window.location.hostname}:3002`
          : 'ws://localhost:3002')
    
    const ws = websocket || (wsUrl ? new WebSocket(wsUrl) : null)
    if (!ws) {
      setError('Não foi possível criar conexão WebSocket para sinalização')
      return
    }
    wsRef.current = ws

    // 2. Configurar WebRTC PeerConnection (arquitetura RustDesk)
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10 // RustDesk usa pool de candidatos
    }

    const pc = new RTCPeerConnection(configuration)
    peerConnectionRef.current = pc

    // 3. Criar RTCDataChannel para comandos de input (como RustDesk)
    const dataChannel = pc.createDataChannel('input', {
      ordered: true, // Garantir ordem (importante para comandos)
      maxRetransmits: 3 // Retransmitir até 3 vezes
    })
    dataChannelRef.current = dataChannel

    dataChannel.onopen = () => {
      console.log('✅ RTCDataChannel aberto (arquitetura RustDesk)')
      setSessionActive(true)
    }

    dataChannel.onerror = (error) => {
      console.error('❌ Erro no RTCDataChannel:', error)
    }

    dataChannel.onclose = () => {
      console.log('⚠️ RTCDataChannel fechado')
      setSessionActive(false)
    }

    // 4. Configurar handlers WebRTC (sinalização)
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

    pc.ontrack = (event) => {
      // Quando o agente enviar vídeo via WebRTC (futuro)
      console.log('✅ Stream WebRTC recebido:', event.streams.length, 'streams')
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0]
        setIsConnected(true)
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('📡 Estado WebRTC:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setIsConnected(true)
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsConnected(false)
        setError('Conexão WebRTC perdida')
      }
    }

    // 5. Handler de mensagens WebSocket (apenas sinalização)
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data)
        
        // Sinalização WebRTC
        if (message.type === 'webrtc_answer' && message.sessionId === sessionId) {
          pc.setRemoteDescription(new RTCSessionDescription(message.answer))
            .then(() => console.log('✅ WebRTC Answer recebido'))
            .catch((error) => console.error('❌ Erro ao processar answer:', error))
        } else if (message.type === 'webrtc_ice_candidate' && message.sessionId === sessionId) {
          if (message.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(message.candidate))
              .catch((error) => console.error('❌ Erro ao adicionar ICE candidate:', error))
          }
        }
        // Frames ainda via WebSocket (até o agente suportar WebRTC para vídeo)
        else if (message.type === 'desktop_frame') {
          if (message.sessionId && message.frame) {
            setSessionActive(true)
            displayFrame(message.frame)
          }
        } else if (message.type === 'session_active' && message.sessionId === sessionId) {
          setSessionActive(true)
        }
      } catch (error) {
        // Ignorar erros silenciosamente
      }
    }

    ws.onopen = () => {
      console.log('✅ WebSocket de sinalização conectado')
      
      // Registrar sessão WebRTC
      ws.send(JSON.stringify({
        type: 'register_webrtc_session',
        sessionId: sessionId,
        computerId: computer.computerId
      }))
      
      // Criar offer WebRTC (como RustDesk)
      setTimeout(async () => {
        try {
          const offer = await pc.createOffer({
            offerToReceiveVideo: true, // Solicitar vídeo (quando agente suportar)
            offerToReceiveAudio: false
          })
          await pc.setLocalDescription(offer)
          
          ws.send(JSON.stringify({
            type: 'webrtc_offer',
            sessionId: sessionId,
            offer: offer,
            computerId: computer.computerId
          }))
          console.log('📤 WebRTC Offer enviado (arquitetura RustDesk)')
        } catch (error) {
          console.error('❌ Erro ao criar offer:', error)
        }
      }, 500)
    }

    ws.onmessage = handleMessage
    ws.onerror = (error) => {
      console.error('❌ Erro WebSocket:', error)
      if (isMounted) setError('Erro de conexão com servidor de sinalização')
    }
    ws.onclose = () => {
      console.log('⚠️ WebSocket de sinalização desconectado')
      setIsConnected(false)
    }

    // Cleanup
    return () => {
      isMounted = false
      if (dataChannelRef.current) {
        try { dataChannelRef.current.close() } catch {}
        dataChannelRef.current = null
      }
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close() } catch {}
        peerConnectionRef.current = null
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [sessionId, computer.computerId, websocket])

  // Enviar comando via RTCDataChannel (arquitetura RustDesk)
  const sendInputCommand = useCallback((message: InputMessage) => {
    const dataChannel = dataChannelRef.current
    
    // Priorizar RTCDataChannel (como RustDesk)
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        const json = JSON.stringify(message)
        dataChannel.send(json)
        return true
      } catch (error) {
        console.error('❌ Erro ao enviar via RTCDataChannel:', error)
      }
    }
    
    // Fallback: WebSocket (temporário até RTCDataChannel estar pronto)
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'uem_remote_action',
          computerId: computer.computerId,
          action: `remote_${message.type}`,
          params: {
            x: message.x,
            y: message.y,
            button: message.button,
            delta: message.delta,
            keyCode: message.keyCode,
            text: message.text,
            modifiers: message.modifiers
          },
          timestamp: Date.now()
        }))
        return true
      } catch (error) {
        console.error('❌ Erro ao enviar via WebSocket:', error)
      }
    }
    
    return false
  }, [computer.computerId])

  // Função para exibir frames (atualmente via WebSocket, futuro via WebRTC)
  const displayFrame = useCallback((base64Frame: string) => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const img = new Image()
    img.onload = () => {
      try {
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Atualizar tamanho do canvas se necessário
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width
          canvas.height = img.height
          remoteScreenSizeRef.current = { width: img.width, height: img.height }
        }

        ctx.drawImage(img, 0, 0)
        imageRef.current = img

        // Ajuste automático (apenas uma vez)
        if (autoFit && containerRef.current && !hasAutoAdjustedRef.current) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (containerRef.current && imageRef.current && !hasAutoAdjustedRef.current) {
                adjustScaleToFit()
              }
            }, 100)
          })
        }
      } catch (error) {
        // Ignorar erros silenciosamente
      }
    }
    
    if (!base64Frame || base64Frame.length === 0) return
    img.src = `data:image/jpeg;base64,${base64Frame}`
  }, [autoFit])

  // Ajustar escala para caber na tela
  const adjustScaleToFit = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height

    if (canvasWidth === 0 || canvasHeight === 0) return

    const scaleX = containerWidth / canvasWidth
    const scaleY = containerHeight / canvasHeight
    const newScale = Math.min(scaleX, scaleY, 1.0) // Não aumentar além do tamanho original

    setScale(newScale)
    hasAutoAdjustedRef.current = true
  }, [])

  // Handlers de mouse (seguindo protocolo RustDesk)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePosition({ x, y })
    
    // Throttling (20 FPS como RustDesk)
    const now = Date.now()
    if (now - lastMouseMoveTimeRef.current >= 50) {
      lastMouseMoveTimeRef.current = now
      
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const realX = Math.round((x / scale) * scaleX)
      const realY = Math.round((y / scale) * scaleY)
      
      sendInputCommand({
        type: 'mouse_move',
        x: Math.max(0, Math.min(realX, canvas.width - 1)),
        y: Math.max(0, Math.min(realY, canvas.height - 1))
      })
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = image.width / (rect.width / scale)
    const scaleY = image.height / (rect.height / scale)
    const canvasX = (e.clientX - rect.left) / scale
    const canvasY = (e.clientY - rect.top) / scale
    const realX = Math.round(canvasX * scaleX)
    const realY = Math.round(canvasY * scaleY)
    const finalX = Math.max(0, Math.min(realX, image.width - 1))
    const finalY = Math.max(0, Math.min(realY, image.height - 1))
    
    lastMouseDownRef.current = { x: finalX, y: finalY, button }
    
    sendInputCommand({
      type: 'mouse_down',
      x: finalX,
      y: finalY,
      button: button as 'left' | 'right' | 'middle'
    })
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    
    // Usar coordenadas do mouse down para garantir precisão
    if (lastMouseDownRef.current && lastMouseDownRef.current.button === button) {
      sendInputCommand({
        type: 'mouse_up',
        x: lastMouseDownRef.current.x,
        y: lastMouseDownRef.current.y,
        button: button as 'left' | 'right' | 'middle'
      })
      lastMouseDownRef.current = null
      return
    }
    
    // Fallback: usar coordenadas atuais
    const canvas = canvasRef.current
    const image = imageRef.current
    if (canvas && image) {
      const rect = canvas.getBoundingClientRect()
      const scaleX = image.width / (rect.width / scale)
      const scaleY = image.height / (rect.height / scale)
      const canvasX = (e.clientX - rect.left) / scale
      const canvasY = (e.clientY - rect.top) / scale
      const realX = Math.round(canvasX * scaleX)
      const realY = Math.round(canvasY * scaleY)
      const finalX = Math.max(0, Math.min(realX, image.width - 1))
      const finalY = Math.max(0, Math.min(realY, image.height - 1))
      
      sendInputCommand({
        type: 'mouse_up',
        x: finalX,
        y: finalY,
        button: button as 'left' | 'right' | 'middle'
      })
    }
    lastMouseDownRef.current = null
  }

  const handleMouseWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = image.width / (rect.width / scale)
    const scaleY = image.height / (rect.height / scale)
    const canvasX = (e.clientX - rect.left) / scale
    const canvasY = (e.clientY - rect.top) / scale
    const realX = Math.round(canvasX * scaleX)
    const realY = Math.round(canvasY * scaleY)
    
    sendInputCommand({
      type: 'mouse_scroll',
      x: Math.max(0, Math.min(realX, image.width - 1)),
      y: Math.max(0, Math.min(realY, image.height - 1)),
      delta: e.deltaY > 0 ? -3 : 3 // Padrão RustDesk
    })
  }

  // Handlers de teclado (seguindo protocolo RustDesk)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const keyCode = keyCodeMap[e.key] || e.keyCode
    
    sendInputCommand({
      type: 'key_down',
      keyCode: keyCode,
      modifiers: {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey
      }
    })
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const keyCode = keyCodeMap[e.key] || e.keyCode
    
    sendInputCommand({
      type: 'key_up',
      keyCode: keyCode,
      modifiers: {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey
      }
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      sendInputCommand({
        type: 'text',
        text: e.key
      })
    }
  }

  // Render
  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onKeyPress={handleKeyPress}
      tabIndex={0}
    >
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full cursor-crosshair"
        style={{ 
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDragging(false)}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleMouseWheel}
      />
      
      {/* Vídeo WebRTC (futuro, quando agente suportar) */}
      <video
        ref={videoRef}
        className="hidden"
        autoPlay
        playsInline
      />
      
      {/* Overlay de informações */}
      {error && (
        <div className="absolute top-4 left-4 bg-red-500 text-white px-4 py-2 rounded">
          {error}
        </div>
      )}
      
      {!sessionActive && (
        <div className="absolute top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded">
          Conectando...
        </div>
      )}
    </div>
  )
}

