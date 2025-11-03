// Cache de última localização salva para evitar queries desnecessárias

class LocationCache {
    constructor(maxSize = 1000) {
        this.cache = new Map(); // deviceId (UUID) -> { latitude, longitude, created_at, timestamp }
        this.maxSize = maxSize;
    }

    get(deviceId) {
        return this.cache.get(deviceId) || null;
    }

    set(deviceId, latitude, longitude, created_at) {
        // Se cache está cheio, remover entrada mais antiga
        if (this.cache.size >= this.maxSize && !this.cache.has(deviceId)) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(deviceId, {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            created_at,
            timestamp: Date.now()
        });
    }

    shouldSave(deviceId, newLatitude, newLongitude) {
        const cached = this.get(deviceId);
        
        if (!cached) {
            return true; // Não tem cache, deve salvar
        }

        // Calcular distância aproximada (Haversine simplificado)
        const latDiff = Math.abs(cached.latitude - parseFloat(newLatitude));
        const lonDiff = Math.abs(cached.longitude - parseFloat(newLongitude));
        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // metros aproximados

        // Verificar tempo desde última localização salva
        const timeDiff = Date.now() - new Date(cached.created_at).getTime();

        // Salvar apenas se mudou mais de 50 metros ou passou mais de 5 minutos
        return distance > 50 || timeDiff > 5 * 60 * 1000;
    }

    updateAfterSave(deviceId, latitude, longitude) {
        this.set(deviceId, latitude, longitude, new Date().toISOString());
    }

    clear(deviceId) {
        this.cache.delete(deviceId);
    }

    clearAll() {
        this.cache.clear();
    }

    getSize() {
        return this.cache.size;
    }
}

module.exports = LocationCache;

