'use client'

/**
 * RemoteDesktopViewer - Visualização de tela remota em tempo real
 * 
 * Funcionalidades:
 * - Visualização da tela do usuário em tempo real
 * - WebSocket para recebimento de frames
 * - Zoom e ajuste de escala
 */

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
  const videoRef = useRef<HTMLVideoElement>(null) // Para vídeo WebRTC (futuro)
  
  // Estados
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scale, setScale] = useState(1.0)
  const [autoFit, setAutoFit] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false)
  const [remoteScreenSize, setRemoteScreenSize] = useState<{ width: number; height: number } | null>(null)
  
  // Refs para WebSocket
  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const videoTrackRef = useRef<MediaStreamTrack | null>(null) // Para vídeo (futuro)
  
  // Refs auxiliares
  const imageRef = useRef<HTMLImageElement | null>(null)
  const hasAutoAdjustedRef = useRef(false)
  const remoteScreenSizeRef = useRef<{ width: number; height: number } | null>(null)

  // Inicializar WebRTC seguindo arquitetura RustDesk
  useEffect(() => {
    if (!sessionId) return
    
    let isMounted = true
    
    // 1. Configurar WebSocket apenas para sinalização (como RustDesk)
    const wsUrl = websocket 
      ? null 
      : (typeof window !== 'undefined' 
          ? `ws://${window.location.hostname}:3001`
          : 'ws://localhost:3001')
    
    const ws = websocket || (wsUrl ? new WebSocket(wsUrl) : null)
    if (!ws) {
      setError('Não foi possível criar conexão WebSocket para sinalização')
      if (isMounted) setIsConnecting(false)
      return
    }
    wsRef.current = ws
    
    // Verificar se WebSocket já está aberto (quando passado via props)
    const isAlreadyOpen = ws.readyState === WebSocket.OPEN
    if (isAlreadyOpen) {
      // WebSocket já está conectado, marcar como conectado imediatamente
      if (isMounted) {
        setIsConnected(true)
        setIsConnecting(false)
      }
    } else {
      // Marcar como conectando apenas se não estiver aberto
      if (isMounted) setIsConnecting(true)
    }

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
      if (isMounted) {
        if (pc.connectionState === 'connected') {
          setIsConnected(true)
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          // Não marcar como desconectado se WebSocket ainda está aberto (fallback funciona)
          // setIsConnected(false)
          // setError('Conexão WebRTC perdida')
          console.log('⚠️ WebRTC desconectado, usando WebSocket como fallback')
        }
      }
    }

    // 5. Handler de mensagens WebSocket (apenas sinalização)
    // Nota: displayFrame será definido depois, então vamos usar uma referência
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
            if (isMounted) {
              if (!hasReceivedFrame) {
                setHasReceivedFrame(true)
              }
              setSessionActive(true)
              setIsConnected(true) // Marcar como conectado quando recebe frames
            }
            // Exibir frame diretamente (displayFrame será usado depois quando definido)
            const canvas = canvasRef.current
            if (canvas) {
              const img = new Image()
              img.onload = () => {
                try {
                  const ctx = canvas.getContext('2d')
                  if (!ctx) return
                  if (canvas.width !== img.width || canvas.height !== img.height) {
                    canvas.width = img.width
                    canvas.height = img.height
                    remoteScreenSizeRef.current = { width: img.width, height: img.height }
                    setRemoteScreenSize({ width: img.width, height: img.height })
                  }
                  ctx.drawImage(img, 0, 0)
                  imageRef.current = img
                  
                  // Ajuste automático (apenas uma vez) - usar ref para acessar valor atual
                  const shouldAutoFit = autoFit
                  if (shouldAutoFit && containerRef.current && !hasAutoAdjustedRef.current) {
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        if (containerRef.current && imageRef.current && !hasAutoAdjustedRef.current) {
                          const container = containerRef.current
                          const img = imageRef.current
                          const containerWidth = container.clientWidth - 20
                          const containerHeight = container.clientHeight - 20
                          const scaleX = containerWidth / img.width
                          const scaleY = containerHeight / img.height
                          const newScale = Math.min(scaleX, scaleY)
                          const finalScale = Math.max(newScale, 0.1)
                          setScale(finalScale)
                          hasAutoAdjustedRef.current = true
                        }
                      }, 100)
                    })
                  }
                } catch (error) {
                  // Ignorar erros
                }
              }
              if (message.frame && message.frame.length > 0) {
                img.src = `data:image/jpeg;base64,${message.frame}`
              }
            }
          }
        } else if (message.type === 'session_active' && message.sessionId === sessionId) {
          if (isMounted) {
            setSessionActive(true)
            setIsConnected(true) // Marcar como conectado quando sessão está ativa
          }
        } else if (message.type === 'desktop_session_error' && message.sessionId === sessionId) {
          if (isMounted) {
            setError(message.error || 'Erro ao iniciar sessão de desktop remoto')
            setIsConnecting(false)
            setIsConnected(false)
          }
        }
      } catch (error) {
        // Ignorar erros silenciosamente
      }
    }

    // Configurar handlers ANTES de registrar sessões
    ws.onmessage = handleMessage
    ws.onerror = (error) => {
      console.error('❌ Erro WebSocket:', error)
      if (isMounted) {
        setIsConnecting(false)
        // Só mostrar erro se não estava conectado antes
        if (!isConnected) {
          setError('Erro de conexão com servidor de sinalização')
        }
      }
    }
    ws.onclose = (event) => {
      console.log('⚠️ WebSocket de sinalização desconectado', { code: event.code, reason: event.reason })
      if (isMounted) {
        setIsConnecting(false)
        // Só marcar como desconectado se não foi um fechamento intencional (código 1000)
        if (event.code !== 1000) {
          setIsConnected(false)
        }
      }
    }
    
    // Função para registrar sessões e criar offer
    const registerSessions = () => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ WebSocket não está aberto, não é possível registrar sessões')
        return
      }
      
      console.log('📤 Registrando sessões:', {
        sessionId: sessionId,
        computerId: computer.computerId,
        wsReadyState: ws.readyState
      })
      
      // Registrar sessão WebRTC
      ws.send(JSON.stringify({
        type: 'register_webrtc_session',
        sessionId: sessionId,
        computerId: computer.computerId
      }))
      console.log('✅ register_webrtc_session enviado')
      
      // Também registrar sessão normal para receber frames via WebSocket
      ws.send(JSON.stringify({
        type: 'register_desktop_session',
        sessionId: sessionId,
        computerId: computer.computerId
      }))
      console.log('✅ register_desktop_session enviado')
      
      // Criar offer WebRTC (como RustDesk)
      setTimeout(async () => {
        // Verificar se ainda está montado e a conexão ainda existe
        if (!isMounted || !peerConnectionRef.current) {
          return
        }
        
        const currentPc = peerConnectionRef.current
        
        try {
          const offer = await currentPc.createOffer({
            offerToReceiveVideo: true, // Solicitar vídeo (quando agente suportar)
            offerToReceiveAudio: false
          })
          
          // Verificar novamente antes de setar a descrição
          if (!isMounted || !peerConnectionRef.current) {
            console.warn('⚠️ RTCPeerConnection fechado durante criação do offer')
            return
          }
          
          await peerConnectionRef.current.setLocalDescription(offer)
          
          // Verificar se WebSocket ainda está aberto
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ WebSocket não está aberto, não é possível enviar offer')
            return
          }
          
          wsRef.current.send(JSON.stringify({
            type: 'webrtc_offer',
            sessionId: sessionId,
            offer: offer,
            computerId: computer.computerId
          }))
          console.log('📤 WebRTC Offer enviado (arquitetura RustDesk)')
        } catch (error) {
          // Ignorar erros se a conexão foi fechada (erro InvalidStateError)
          if (error instanceof Error && error.name === 'InvalidStateError') {
            console.warn('⚠️ RTCPeerConnection fechado durante criação do offer')
          } else {
            console.error('❌ Erro ao criar offer:', error)
          }
        }
      }, 500)
    }
    
    // Se já está aberto, registrar imediatamente (após configurar handlers)
    if (isAlreadyOpen) {
      registerSessions()
    }
    
    ws.onopen = () => {
      console.log('✅ WebSocket de sinalização conectado')
      if (isMounted) {
        setIsConnected(true) // Marcar como conectado quando WebSocket abre
        setIsConnecting(false) // Não está mais conectando
      }
      registerSessions()
    }

    // Cleanup
    return () => {
      isMounted = false
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close() } catch {}
        peerConnectionRef.current = null
      }
      if (ws) {
        // Remover listeners antes de fechar para evitar logs de erro
        ws.onopen = null
        ws.onerror = null
        ws.onclose = null
        ws.onmessage = null
        
        // Só fechar se foi criado por este componente (não foi passado via props)
        if (!websocket && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          ws.close(1000, 'Component unmounting') // Fechamento normal
        }
      }
    }
  }, [sessionId, computer.computerId, websocket, autoFit])


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
          setRemoteScreenSize({ width: img.width, height: img.height })
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
  const adjustScaleToFit = useCallback((force = false) => {
    if (!canvasRef.current || !containerRef.current || !imageRef.current) {
      return
    }
    
    if (hasAutoAdjustedRef.current && autoFit && !force) {
      return
    }
    
    const container = containerRef.current
    const img = imageRef.current
    
    const containerWidth = container.clientWidth - 20
    const containerHeight = container.clientHeight - 20
    
    const scaleX = containerWidth / img.width
    const scaleY = containerHeight / img.height
    
    const newScale = Math.min(scaleX, scaleY)
    const finalScale = Math.max(newScale, 0.1)
    
    setScale(finalScale)
    
    if (autoFit && !force) {
      hasAutoAdjustedRef.current = true
    }
  }, [autoFit])


  // Funções de UI (zoom, fullscreen, etc.)
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const elem = containerRef.current
      if (elem?.requestFullscreen) {
        elem.requestFullscreen()
        setIsFullscreen(true)
        setTimeout(() => {
          if (autoFit) adjustScaleToFit()
        }, 100)
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
        setIsFullscreen(false)
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
    setScale(prev => Math.min(prev + 0.1, 3.0))
  }

  const handleZoomOut = () => {
    setAutoFit(false)
    setScale(prev => Math.max(prev - 0.1, 0.1))
  }

  const handleZoomFit = () => {
    setAutoFit(false)
    setTimeout(() => {
      adjustScaleToFit(true)
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

  // Ajustar escala quando o tamanho da janela mudar
  useEffect(() => {
    if (!autoFit || !hasReceivedFrame || hasAutoAdjustedRef.current) return
    
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
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

  // Render
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex flex-col z-50"
      onClick={(e) => {
        // Não fechar ao clicar - apenas com ESC ou botão fechar
        e.stopPropagation()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div 
        className="bg-gray-600 text-white p-4 flex justify-between items-center border-b border-gray-500"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Acesso Remoto - {computer.name}</h2>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500/150/150' : 'bg-red-500/150/150'}`}></div>
          <span className="text-sm">{isConnected ? 'Conectado' : 'Desconectado'}</span>
        </div>
        <div className="flex items-center gap-2">
          {remoteScreenSize && (
            <div className="text-sm text-[var(--text-muted)] mr-4">
              {remoteScreenSize.width}x{remoteScreenSize.height}px
            </div>
          )}
          
          {hasReceivedFrame && (
            <div className="flex items-center gap-1 bg-gray-700 rounded px-2 py-1">
              <button
                onClick={handleZoomOut}
                className="px-3 py-1.5 bg-gray-600 hover:bg-[var(--surface-elevated)]0 rounded text-sm font-medium transition-colors"
                title="Diminuir zoom"
              >
                −
              </button>
              <button
                onClick={handleZoomFit}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-gray-600 text-white hover:bg-[var(--surface-elevated)]0"
                title="Ajustar ao tamanho da tela"
              >
                Ajustar
              </button>
              <span className="px-3 py-1.5 text-sm text-white min-w-[60px] text-center font-medium">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="px-3 py-1.5 bg-gray-600 hover:bg-[var(--surface-elevated)]0 rounded text-sm font-medium transition-colors"
                title="Aumentar zoom"
              >
                +
              </button>
              <button
                onClick={handleZoomReset}
                className="px-3 py-1.5 bg-gray-600 hover:bg-[var(--surface-elevated)]0 rounded text-sm font-medium transition-colors"
                title="Resetar zoom (100%)"
              >
                ⟲
              </button>
            </div>
          )}
          
          <button
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-blue-500/150/150 hover:bg-blue-600 rounded font-medium transition-colors"
          >
            {isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-500/150/150 hover:bg-red-600 rounded font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden bg-black flex items-center justify-center relative outline-none"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
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
                <li>Verifique se a porta 3001 está disponível</li>
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
        
        {!isConnected && !error && isConnecting && (
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Conectando ao computador remoto...</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">Aguardando conexão WebSocket na porta 3001</p>
          </div>
        )}
        
        {!isConnected && !error && !isConnecting && (
          <div className="text-white text-center">
            <p className="text-yellow-500">Aguardando sessão de desktop remoto...</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">WebSocket conectado, aguardando frames do computador remoto</p>
          </div>
        )}

        {isConnected && !hasReceivedFrame && !error && (
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Aguardando frames do computador remoto...</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Verifique se o agente está online e recebendo comandos.
              <br />
              Confira o console do agente para ver se está capturando a tela.
            </p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`border border-gray-700 shadow-2xl ${hasReceivedFrame ? 'block' : 'hidden'}`}
          style={{ 
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            imageRendering: scale >= 1 ? 'auto' : 'crisp-edges',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        />
        
        {/* Vídeo WebRTC (futuro, quando agente suportar) */}
        <video
          ref={videoRef}
          className="hidden"
          autoPlay
          playsInline
        />
      </div>
    </div>
  )
}









