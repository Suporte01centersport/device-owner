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
  const wsRef = useRef<WebSocket | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isLocalTest, setIsLocalTest] = useState(false) // Detectar se é teste local
  const [remoteScreenSize, setRemoteScreenSize] = useState<{ width: number; height: number } | null>(null)
  const hasAutoAdjustedRef = useRef(false) // Flag para garantir que só ajuste automaticamente uma vez

  // Mapeamento de teclas JavaScript para códigos Windows Virtual Key
  const keyCodeMap: Record<string, number> = {
    'Enter': 0x0D,
    'Escape': 0x1B,
    'Backspace': 0x08,
    'Tab': 0x09,
    'Shift': 0x10,
    'Control': 0x11,
    'Alt': 0x12,
    'Space': 0x20,
    'ArrowUp': 0x26,
    'ArrowDown': 0x28,
    'ArrowLeft': 0x25,
    'ArrowRight': 0x27,
    'Delete': 0x2E,
    'Home': 0x24,
    'End': 0x23,
    'PageUp': 0x21,
    'PageDown': 0x22,
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
    
    // Usar WebSocket fornecido ou criar novo
    // Usar a mesma porta do servidor Next.js se estiver em desenvolvimento, ou porta 3002 para produção
    const wsUrl = websocket 
      ? null 
      : (typeof window !== 'undefined' 
          ? `ws://${window.location.hostname}:3002`
          : 'ws://localhost:3002')
    
    const ws = websocket || (wsUrl ? new WebSocket(wsUrl) : null)
    
    if (!ws) {
      setError('Não foi possível criar conexão WebSocket')
      return
    }
    wsRef.current = ws

    // Função para registrar sessão
    const registerSession = () => {
      if (!sessionId || ws.readyState !== WebSocket.OPEN) {
        return
      }
      
      const registerMessage = {
        type: 'register_desktop_session',
        sessionId: sessionId,
        computerId: computer.computerId
      }
      
      try {
        ws.send(JSON.stringify(registerMessage))
      } catch (error) {
        // Silenciosamente ignorar erros de envio
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
            displayFrame(message.frame)
          }
        }
      } catch (error) {
        // Silenciosamente ignorar erros ao processar mensagens
      }
    }

    // Se o WebSocket já está conectado (readyState === 1), registrar imediatamente
    if (ws.readyState === WebSocket.OPEN) {
      setIsConnected(true)
      
      // Adicionar handler de mensagens usando addEventListener para não sobrescrever
      // Isso permite múltiplos handlers
      const messageHandler = (event: MessageEvent) => {
        handleMessage(event)
      }
      ws.addEventListener('message', messageHandler)
      
      // Armazenar referência para poder remover depois
      // @ts-ignore - armazenar handler customizado
      ws._remoteDesktopHandler = messageHandler
      
      // Registrar sessão imediatamente
      setTimeout(() => {
        registerSession()
      }, 500) // Pequeno delay para garantir que o servidor processou o web_client
    } else {
      // Se não está conectado, aguardar o evento onopen
      ws.onopen = () => {
        setIsConnected(true)
        
        // Registrar como cliente web primeiro
        ws.send(JSON.stringify({ type: 'web_client' }))
        
        // Configurar handler de mensagens
        ws.onmessage = handleMessage
        
        // Depois registrar sessão no servidor (isso vai iniciar a captura no agente)
        setTimeout(() => {
          registerSession()
        }, 1000) // Delay para garantir que o cliente foi registrado
      }
      
      // Configurar handlers de erro e close apenas se não for websocket fornecido
      if (!websocket) {
        ws.onerror = (error) => {
          setError('Erro de conexão com o servidor WebSocket')
        }

        ws.onclose = () => {
          setIsConnected(false)
        }
      }
    }

    // A sessão já foi iniciada via RemoteAccessModal, apenas aguardar frames

    return () => {
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
      
      if (!websocket && wsRef.current) {
        wsRef.current.close()
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

  const sendMouseEvent = useCallback((action: string, x: number, y: number, button: string = 'left', delta?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Calcular coordenadas reais baseadas no canvas
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    const realX = Math.round((x - rect.left) * scaleX)
    const realY = Math.round((y - rect.top) * scaleY)

    // Enviar comando diretamente via WebSocket (mais rápido e eficiente)
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'uem_remote_action',
        computerId: computer.computerId,
        action: action,
        params: { 
          x: realX, 
          y: realY, 
          button: button, 
          delta: delta
        },
        timestamp: Date.now()
      }))
    }
  }, [computer.computerId])

  const sendKeyEvent = useCallback((action: string, keyCode: number) => {
    // Enviar comando diretamente via WebSocket (mais rápido e eficiente)
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'uem_remote_action',
        computerId: computer.computerId,
        action: action,
        params: { 
          keyCode: keyCode
        },
        timestamp: Date.now()
      }))
    }
  }, [computer.computerId])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePosition({ x, y })
    
    // Enviar movimento do mouse apenas ocasionalmente (para não sobrecarregar)
    // Usar throttling implícito através do rate limiting do fetch
    if (Math.random() < 0.1) { // 10% das vezes
      sendMouseEvent('remote_mouse_move', e.clientX, e.clientY)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setIsDragging(true)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    sendMouseEvent('remote_mouse_down', e.clientX, e.clientY, button)
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    sendMouseEvent('remote_mouse_up', e.clientX, e.clientY, button)
  }

  const handleMouseClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
    sendMouseEvent('remote_mouse_click', e.clientX, e.clientY, button)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = e.deltaY > 0 ? -120 : 120
    sendMouseEvent('remote_mouse_wheel', e.clientX, e.clientY, 'middle', delta)
    e.preventDefault()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const keyCode = keyCodeMap[e.key] || e.keyCode || e.key.charCodeAt(0)
    sendKeyEvent('remote_key_down', keyCode)
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const keyCode = keyCodeMap[e.key] || e.keyCode || e.key.charCodeAt(0)
    sendKeyEvent('remote_key_up', keyCode)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    // Para caracteres normais, enviar como texto
    if (e.key.length === 1) {
      fetch('/api/uem/remote/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: computer.computerId,
          action: 'remote_text',
          params: { text: e.key }
        })
      }).catch(() => {}) // Silenciosamente ignorar erros
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
        className="flex-1 overflow-hidden bg-black flex items-center justify-center relative"
        tabIndex={0}
        onKeyDown={(e) => {
          // Permitir ESC para fechar
          if (e.key === 'Escape') {
            onClose()
            return
          }
          // Outras teclas vão para o controle remoto
          handleKeyDown(e)
        }}
        onKeyUp={handleKeyUp}
        onKeyPress={handleKeyPress}
        onClick={(e) => {
          // Não fechar ao clicar na área do canvas
          e.stopPropagation()
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
            e.stopPropagation()
            handleMouseClick(e)
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
            // Duplo clique = dois cliques rápidos
            const button = 'left'
            sendMouseEvent('remote_mouse_click', e.clientX, e.clientY, button)
            setTimeout(() => {
              sendMouseEvent('remote_mouse_click', e.clientX, e.clientY, button)
            }, 100)
          }}
        />
      </div>
    </div>
  )
}

