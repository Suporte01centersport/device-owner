interface QueuedMessage {
  id: string
  message: any
  timestamp: number
  attempts: number
  maxAttempts: number
  priority: 'high' | 'normal' | 'low'
}

class MessageQueue {
  private queue: QueuedMessage[] = []
  private processing = false
  private maxQueueSize = 100
  private retryDelay = 1000 // 1 segundo
  private maxRetryDelay = 30000 // 30 segundos

  constructor() {
    // Processar fila a cada segundo
    setInterval(() => {
      this.processQueue()
    }, 1000)
  }

  add(message: any, priority: 'high' | 'normal' | 'low' = 'normal', maxAttempts: number = 3): string {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const queuedMessage: QueuedMessage = {
      id,
      message,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts,
      priority
    }

    // Adicionar na posição correta baseada na prioridade
    if (priority === 'high') {
      this.queue.unshift(queuedMessage)
    } else if (priority === 'low') {
      this.queue.push(queuedMessage)
    } else {
      // Inserir após mensagens de alta prioridade
      const highPriorityIndex = this.queue.findIndex(msg => msg.priority !== 'high')
      if (highPriorityIndex === -1) {
        this.queue.push(queuedMessage)
      } else {
        this.queue.splice(highPriorityIndex, 0, queuedMessage)
      }
    }

    // Limitar tamanho da fila
    if (this.queue.length > this.maxQueueSize) {
      const removed = this.queue.splice(this.maxQueueSize)
      console.warn(`Fila de mensagens cheia, removendo ${removed.length} mensagens antigas`)
    }

    console.log(`Mensagem adicionada à fila: ${id} (prioridade: ${priority})`)
    return id
  }

  remove(id: string): boolean {
    const index = this.queue.findIndex(msg => msg.id === id)
    if (index !== -1) {
      this.queue.splice(index, 1)
      console.log(`Mensagem removida da fila: ${id}`)
      return true
    }
    return false
  }

  clear(): void {
    this.queue = []
    console.log('Fila de mensagens limpa')
  }

  getQueueStatus() {
    return {
      size: this.queue.length,
      maxSize: this.maxQueueSize,
      processing: this.processing,
      messages: this.queue.map(msg => ({
        id: msg.id,
        priority: msg.priority,
        attempts: msg.attempts,
        maxAttempts: msg.maxAttempts,
        age: Date.now() - msg.timestamp
      }))
    }
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    try {
      const message = this.queue[0]
      
      // Verificar se a mensagem expirou (mais de 5 minutos)
      if (Date.now() - message.timestamp > 5 * 60 * 1000) {
        console.warn(`Mensagem expirada removida: ${message.id}`)
        this.queue.shift()
        this.processing = false
        return
      }

      // Verificar se excedeu o número máximo de tentativas
      if (message.attempts >= message.maxAttempts) {
        console.error(`Mensagem falhou após ${message.maxAttempts} tentativas: ${message.id}`)
        this.queue.shift()
        this.processing = false
        return
      }

      // Incrementar contador de tentativas
      message.attempts++

      // Calcular delay baseado no número de tentativas
      const delay = Math.min(
        this.retryDelay * Math.pow(2, message.attempts - 1),
        this.maxRetryDelay
      )

      // Aguardar delay antes de processar
      await new Promise(resolve => setTimeout(resolve, delay))

      // Processar mensagem (isso será implementado pelo hook que usa a fila)
      const success = await this.sendMessage(message.message)
      
      if (success) {
        console.log(`Mensagem enviada com sucesso: ${message.id}`)
        this.queue.shift()
      } else {
        console.warn(`Falha ao enviar mensagem: ${message.id} (tentativa ${message.attempts}/${message.maxAttempts})`)
      }

    } catch (error) {
      console.error('Erro ao processar fila de mensagens:', error)
    } finally {
      this.processing = false
    }
  }

  private async sendMessage(message: any): Promise<boolean> {
    // Esta função será sobrescrita pelo hook que usa a fila
    return false
  }

  setSendFunction(sendFn: (message: any) => Promise<boolean>) {
    // @ts-ignore
    this.sendMessage = sendFn
  }
}

// Instância global da fila
export const messageQueue = new MessageQueue()

// Hook para usar a fila de mensagens
export const useMessageQueue = (sendFunction: (message: any) => Promise<boolean>) => {
  // Configurar função de envio na fila
  messageQueue.setSendFunction(sendFunction)

  const queueMessage = (message: any, priority: 'high' | 'normal' | 'low' = 'normal', maxAttempts: number = 3) => {
    return messageQueue.add(message, priority, maxAttempts)
  }

  const removeMessage = (id: string) => {
    return messageQueue.remove(id)
  }

  const clearQueue = () => {
    messageQueue.clear()
  }

  const getQueueStatus = () => {
    return messageQueue.getQueueStatus()
  }

  return {
    queueMessage,
    removeMessage,
    clearQueue,
    getQueueStatus
  }
}
