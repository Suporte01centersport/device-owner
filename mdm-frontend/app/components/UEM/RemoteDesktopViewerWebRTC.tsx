'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Computer } from '../../types/uem'

interface RemoteDesktopViewerWebRTCProps {
  computer: Computer
  sessionId: string
  onClose: () => void
  websocket?: WebSocket
}

export default function RemoteDesktopViewerWebRTC({ 
  computer, 
  sessionId, 
  onClose,
  websocket 
}: RemoteDesktopViewerWebRTCProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  // Mapeamento de teclas JavaScript para códigos Windows Virtual Key
  const keyCodeMap: Record<string, number> = {
    'Enter': 0x0D, 'Escape': 0x1B, 'Backspace': 0x08, 'Tab': 0x09,
    'Shift': 0x10, 'Control': 0x11, 'Alt': 0x12, 'Space': 0x20,
    'ArrowUp': 0x26, 'ArrowDown': 0x28, 'ArrowLeft': 0x25, 'ArrowRight': 0x27,
    'Delete': 0x2E, 'Home': 0x24, 'End': 0x23, 'PageUp': 0x21, 'PageDown': 0x22,
    'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
    'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
    'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

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

    // WebSocket para sinalização
    const wsUrl = websocket 
      ? null 
      : `ws://${window.location.hostname}:3002`
    
    const ws = websocket || (wsUrl ? new WebSocket(wsUrl) : null)
    
    if (!ws) {
      setError('Não foi possível criar conexão WebSocket para sinalização')
      return
    }
    wsRef.current = ws

    // Configurar WebRTC PeerConnection
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
      console.log('✅ Stream WebRTC recebido:', event.streams.length, 'streams')
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0]
        setIsConnected(true)
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('📡 Estado da conexão WebRTC:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setIsConnected(true)
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsConnected(false)
        setError('Conexão WebRTC perdida')
      }
    }

    // Criar Data Channel para comandos de input
    const dataChannel = pc.createDataChannel('input', {
      ordered: true
    })
    dataChannelRef.current = dataChannel

    dataChannel.onopen = () => {
      console.log('✅ Data Channel aberto para comandos de input')
    }

    dataChannel.onerror = (error) => {
      console.error('❌ Erro no Data Channel:', error)
    }

    // Configurar WebSocket para sinalização
    ws.onopen = () => {
      console.log('✅ WebSocket conectado para sinalização WebRTC')
      
      // Registrar como cliente web
      ws.send(JSON.stringify({ type: 'web_client' }))
      
      // Registrar sessão de desktop remoto
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'register_webrtc_session',
          sessionId: sessionId,
          computerId: computer.computerId
        }))
        console.log(`📤 Registrando sessão WebRTC: ${sessionId}`)
        
        // Criar offer após registrar
        setTimeout(() => {
          createOffer(pc, ws)
        }, 500)
      }, 1000)
    }

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'webrtc_offer' && message.sessionId === sessionId) {
          // Receber offer do agente e criar answer
          await pc.setRemoteDescription(new RTCSessionDescription(message.offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          
          ws.send(JSON.stringify({
            type: 'webrtc_answer',
            sessionId: sessionId,
            answer: answer,
            computerId: computer.computerId
          }))
          console.log('📤 Answer WebRTC enviado')
        } else if (message.type === 'webrtc_answer' && message.sessionId === sessionId) {
          // Receber answer do agente
          await pc.setRemoteDescription(new RTCSessionDescription(message.answer))
          console.log('✅ Answer WebRTC recebido')
        } else if (message.type === 'webrtc_ice_candidate' && message.sessionId === sessionId) {
          // Receber ICE candidate do agente
          try {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate))
            console.log('✅ ICE candidate adicionado')
          } catch (error) {
            console.error('❌ Erro ao adicionar ICE candidate:', error)
          }
        } else if (message.type === 'webrtc_error') {
          setError(message.error || 'Erro na conexão WebRTC')
        }
      } catch (error) {
        console.error('❌ Erro ao processar mensagem de sinalização:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('❌ Erro WebSocket:', error)
      setError('Erro de conexão com o servidor de sinalização')
    }

    ws.onclose = () => {
      console.log('❌ WebSocket de sinalização desconectado')
      setIsConnected(false)
    }

    async function createOffer(pc: RTCPeerConnection, ws: WebSocket) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false
        })
        await pc.setLocalDescription(offer)
        
        ws.send(JSON.stringify({
          type: 'webrtc_offer',
          sessionId: sessionId,
          offer: offer,
          computerId: computer.computerId
        }))
        console.log('📤 Offer WebRTC enviado')
      } catch (error) {
        console.error('❌ Erro ao criar offer:', error)
        setError('Erro ao iniciar conexão WebRTC')
      }
    }

    return () => {
      // Limpar conexões
      if (dataChannelRef.current) {
        dataChannelRef.current.close()
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
      if (!websocket && wsRef.current) {
        wsRef.current.close()
      }
      
      // Parar sessão no servidor
      fetch('/api/uem/remote/desktop/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: sessionId,
          computerId: computer.computerId 
        })
      }).catch(err => console.error('Erro ao parar sessão:', err))
    }
  }, [sessionId, computer.computerId, websocket])

  // Enviar comandos via Data Channel
  const sendInputCommand = useCallback((command: any) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify(command))
      } catch (error) {
        console.error('❌ Erro ao enviar comando via Data Channel:', error)
        // Fallback: enviar via API REST
        fetch('/api/uem/remote/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: computer.computerId,
            action: command.action,
            params: command.params
          })
        }).catch(err => console.error('Erro ao enviar comando:', err))
      }
    } else {
      // Fallback: enviar via API REST se Data Channel não estiver disponível
      fetch('/api/uem/remote/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: computer.computerId,
          action: command.action,
          params: command.params
        })
      }).catch(err => console.error('Erro ao enviar comando:', err))
    }
  }, [computer.computerId])

  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return
    
    const rect = videoRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePosition({ x, y })
    
    // Calcular coordenadas reais baseadas no vídeo
    const video = videoRef.current
    const scaleX = video.videoWidth / rect.width
    const scaleY = video.videoHeight / rect.height
    
    const realX = Math.round(x * scaleX)
    const realY = Math.round(y * scaleY)
    
    // Enviar movimento do mouse ocasionalmente (throttling)
    if (Math.random() < 0.1) {
      sendInputCommand({
        action: 'remote_mouse_move',
        params: { x: realX, y: realY }
      })
    }
  }

  const handleMouseClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return
    e.preventDefault()
    
    const rect = videoRef.current.getBoundingClientRect()
    const video = videoRef.current
    const scaleX = video.videoWidth / rect.width
    const scaleY = video.videoHeight / rect.height
    
    const realX = Math.round((e.clientX - rect.left) * scaleX)
    const realY = Math.round((e.clientY - rect.top) * scaleY)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    
    sendInputCommand({
      action: 'remote_mouse_click',
      params: { x: realX, y: realY, button: button }
    })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return
    e.preventDefault()
    
    const rect = videoRef.current.getBoundingClientRect()
    const video = videoRef.current
    const scaleX = video.videoWidth / rect.width
    const scaleY = video.videoHeight / rect.height
    
    const realX = Math.round((e.clientX - rect.left) * scaleX)
    const realY = Math.round((e.clientY - rect.top) * scaleY)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    
    sendInputCommand({
      action: 'remote_mouse_down',
      params: { x: realX, y: realY, button: button }
    })
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return
    e.preventDefault()
    
    const rect = videoRef.current.getBoundingClientRect()
    const video = videoRef.current
    const scaleX = video.videoWidth / rect.width
    const scaleY = video.videoHeight / rect.height
    
    const realX = Math.round((e.clientX - rect.left) * scaleX)
    const realY = Math.round((e.clientY - rect.top) * scaleY)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    
    sendInputCommand({
      action: 'remote_mouse_up',
      params: { x: realX, y: realY, button: button }
    })
  }

  const handleWheel = (e: React.WheelEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return
    e.preventDefault()
    
    const delta = e.deltaY > 0 ? -120 : 120
    sendInputCommand({
      action: 'remote_mouse_wheel',
      params: { delta: delta }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const keyCode = keyCodeMap[e.key] || e.keyCode || e.key.charCodeAt(0)
    sendInputCommand({
      action: 'remote_key_down',
      params: { keyCode: keyCode }
    })
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const keyCode = keyCodeMap[e.key] || e.keyCode || e.key.charCodeAt(0)
    sendInputCommand({
      action: 'remote_key_up',
      params: { keyCode: keyCode }
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.key.length === 1) {
      sendInputCommand({
        action: 'remote_text',
        params: { text: e.key }
      })
    }
  }

  const toggleFullscreen = () => {
    if (!videoRef.current) return
    
    if (!isFullscreen) {
      const elem = videoRef.current
      if (elem.requestFullscreen) {
        elem.requestFullscreen()
        setIsFullscreen(true)
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
        setIsFullscreen(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col z-50">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Acesso Remoto WebRTC - {computer.name}</h2>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">{isConnected ? 'Conectado (P2P)' : 'Conectando...'}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            {isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Video Area */}
      <div 
        className="flex-1 overflow-auto bg-gray-800 flex items-center justify-center"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onKeyPress={handleKeyPress}
      >
        {error && (
          <div className="bg-red-900 bg-opacity-90 text-white p-6 rounded-lg max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-2">❌ Erro de Conexão WebRTC</h3>
            <p className="mb-4">{error}</p>
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
            <p>Estabelecendo conexão WebRTC P2P...</p>
            <p className="text-sm text-gray-400 mt-2">Aguardando sinalização e estabelecimento de conexão</p>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="max-w-full max-h-full cursor-crosshair border border-gray-600"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleMouseClick}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          onDoubleClick={(e) => {
            e.preventDefault()
            handleMouseClick(e)
            setTimeout(() => handleMouseClick(e), 100)
          }}
        />

        {/* Controles */}
        <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-75 text-white p-2 rounded">
          <div className="flex gap-4 items-center">
            <span className="text-sm">
              Mouse: {mousePosition.x}, {mousePosition.y}
            </span>
            <span className="text-xs text-gray-400">
              {isConnected ? 'Conexão P2P Ativa' : 'Conectando...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

