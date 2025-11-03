// Sistema de Batch Operations para otimizar writes no banco de dados
// Agrupa múltiplas operações de save em batches para reduzir queries

class BatchQueue {
    constructor(batchSize = 10, batchInterval = 1000) {
        this.batchSize = batchSize;
        this.batchInterval = batchInterval;
        this.queue = new Map(); // deviceId -> { deviceData, timestamp, resolve, reject }
        this.batchTimeout = null;
        this.isProcessing = false;
    }

    async add(deviceId, deviceData) {
        return new Promise((resolve, reject) => {
            // Substituir qualquer entrada anterior do mesmo dispositivo (debouncing)
            this.queue.set(deviceId, {
                deviceData,
                timestamp: Date.now(),
                resolve,
                reject
            });

            // Se a fila atingir batchSize, processar imediatamente
            if (this.queue.size >= this.batchSize) {
                this.processBatch();
            } else if (!this.batchTimeout) {
                // Agendar processamento após batchInterval
                this.batchTimeout = setTimeout(() => {
                    this.processBatch();
                }, this.batchInterval);
            }
        });
    }

    async processBatch() {
        if (this.isProcessing || this.queue.size === 0) {
            return;
        }

        // Limpar timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }

        this.isProcessing = true;

        // Obter todos os itens da fila
        const items = Array.from(this.queue.entries());
        this.queue.clear();

        // Processar cada item individualmente (postgresql não suporta batch INSERT bem)
        // Mas agrupamos para reduzir overhead de setTimeout
        const results = new Map();

        for (const [deviceId, item] of items) {
            try {
                // Chamar a função de save (será injetada)
                if (this.saveFunction) {
                    const result = await this.saveFunction(item.deviceData);
                    results.set(deviceId, { success: true, result });
                    item.resolve(result);
                } else {
                    throw new Error('Save function not set');
                }
            } catch (error) {
                results.set(deviceId, { success: false, error });
                item.reject(error);
            }
        }

        this.isProcessing = false;

        // Se novos itens foram adicionados durante o processamento, agendar próximo batch
        if (this.queue.size > 0) {
            this.batchTimeout = setTimeout(() => {
                this.processBatch();
            }, this.batchInterval);
        }
    }

    setSaveFunction(fn) {
        this.saveFunction = fn;
    }

    getQueueSize() {
        return this.queue.size;
    }

    flush() {
        // Forçar processamento imediato de todos os itens pendentes
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        return this.processBatch();
    }
}

module.exports = BatchQueue;

