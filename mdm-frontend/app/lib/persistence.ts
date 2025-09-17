import { useCallback, useEffect, useState } from 'react'
import { Device } from '../types/device'

interface PersistenceConfig {
  devicesKey: string
  adminPasswordKey: string
  autoSave: boolean
  debounceMs: number
}

const DEFAULT_CONFIG: PersistenceConfig = {
  devicesKey: 'mdm_devices',
  adminPasswordKey: 'mdm_admin_password',
  autoSave: true,
  debounceMs: 500
}

export const usePersistence = (config: Partial<PersistenceConfig> = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const [isLoaded, setIsLoaded] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [adminPassword, setAdminPassword] = useState<string>('')

  // Função para salvar dispositivos
  const saveDevices = useCallback((newDevices: Device[]) => {
    try {
      localStorage.setItem(finalConfig.devicesKey, JSON.stringify(newDevices))
      console.log('Dispositivos salvos no localStorage:', newDevices.length)
    } catch (error) {
      console.error('Erro ao salvar dispositivos no localStorage:', error)
    }
  }, [finalConfig.devicesKey])

  // Função para carregar dispositivos
  const loadDevices = useCallback((): Device[] => {
    try {
      const saved = localStorage.getItem(finalConfig.devicesKey)
      if (saved) {
        const devices = JSON.parse(saved)
        console.log('Dispositivos carregados do localStorage:', devices.length)
        return devices
      }
    } catch (error) {
      console.error('Erro ao carregar dispositivos do localStorage:', error)
    }
    return []
  }, [finalConfig.devicesKey])

  // Função para salvar senha de administrador
  const saveAdminPassword = useCallback((password: string) => {
    try {
      localStorage.setItem(finalConfig.adminPasswordKey, password)
      console.log('Senha de administrador salva no localStorage')
    } catch (error) {
      console.error('Erro ao salvar senha no localStorage:', error)
    }
  }, [finalConfig.adminPasswordKey])

  // Função para carregar senha de administrador
  const loadAdminPassword = useCallback((): string => {
    try {
      const saved = localStorage.getItem(finalConfig.adminPasswordKey)
      if (saved) {
        console.log('Senha de administrador carregada do localStorage')
        return saved
      }
    } catch (error) {
      console.error('Erro ao carregar senha do localStorage:', error)
    }
    return ''
  }, [finalConfig.adminPasswordKey])

  // Função para limpar todos os dados
  const clearAllData = useCallback(() => {
    try {
      localStorage.removeItem(finalConfig.devicesKey)
      localStorage.removeItem(finalConfig.adminPasswordKey)
      setDevices([])
      setAdminPassword('')
      console.log('Todos os dados limpos do localStorage')
    } catch (error) {
      console.error('Erro ao limpar dados do localStorage:', error)
    }
  }, [finalConfig.devicesKey, finalConfig.adminPasswordKey])

  // Função para atualizar dispositivos com auto-save
  const updateDevices = useCallback((newDevices: Device[] | ((prev: Device[]) => Device[])) => {
    setDevices(prevDevices => {
      const updatedDevices = typeof newDevices === 'function' ? newDevices(prevDevices) : newDevices
      
      if (finalConfig.autoSave) {
        // Debounce para evitar muitas operações de escrita
        setTimeout(() => {
          saveDevices(updatedDevices)
        }, finalConfig.debounceMs)
      }
      
      return updatedDevices
    })
  }, [saveDevices, finalConfig.autoSave, finalConfig.debounceMs])

  // Função para atualizar senha de administrador com auto-save
  const updateAdminPassword = useCallback((password: string) => {
    setAdminPassword(password)
    
    if (finalConfig.autoSave) {
      setTimeout(() => {
        saveAdminPassword(password)
      }, finalConfig.debounceMs)
    }
  }, [saveAdminPassword, finalConfig.autoSave, finalConfig.debounceMs])

  // Carregar dados na inicialização
  useEffect(() => {
    const savedDevices = loadDevices()
    const savedPassword = loadAdminPassword()
    
    setDevices(savedDevices)
    setAdminPassword(savedPassword)
    setIsLoaded(true)
    
    console.log('Dados de persistência carregados:', {
      devices: savedDevices.length,
      hasPassword: !!savedPassword
    })
  }, [loadDevices, loadAdminPassword])

  // Função para sincronizar com dados do servidor
  const syncWithServer = useCallback((serverDevices: Device[], serverPassword?: string) => {
    console.log('Sincronizando com dados do servidor:', {
      serverDevices: serverDevices.length,
      currentDevices: devices.length,
      hasServerPassword: !!serverPassword
    })

    // Atualizar dispositivos se os dados do servidor forem diferentes
    if (JSON.stringify(serverDevices) !== JSON.stringify(devices)) {
      setDevices(serverDevices)
      saveDevices(serverDevices)
    }

    // Atualizar senha se fornecida pelo servidor
    if (serverPassword !== undefined && serverPassword !== adminPassword) {
      setAdminPassword(serverPassword)
      saveAdminPassword(serverPassword)
    }
  }, [devices, adminPassword, saveDevices, saveAdminPassword])

  // Função para verificar se há dados salvos
  const hasSavedData = useCallback(() => {
    return devices.length > 0 || adminPassword.length > 0
  }, [devices.length, adminPassword.length])

  // Função para exportar dados
  const exportData = useCallback(() => {
    return {
      devices,
      adminPassword,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    }
  }, [devices, adminPassword])

  // Função para importar dados
  const importData = useCallback((data: any) => {
    try {
      if (data.devices && Array.isArray(data.devices)) {
        setDevices(data.devices)
        saveDevices(data.devices)
      }
      
      if (data.adminPassword && typeof data.adminPassword === 'string') {
        setAdminPassword(data.adminPassword)
        saveAdminPassword(data.adminPassword)
      }
      
      console.log('Dados importados com sucesso')
      return true
    } catch (error) {
      console.error('Erro ao importar dados:', error)
      return false
    }
  }, [saveDevices, saveAdminPassword])

  return {
    // Estado
    devices,
    adminPassword,
    isLoaded,
    
    // Funções de dispositivos
    updateDevices,
    saveDevices,
    loadDevices,
    
    // Funções de senha
    updateAdminPassword,
    saveAdminPassword,
    loadAdminPassword,
    
    // Funções utilitárias
    clearAllData,
    syncWithServer,
    hasSavedData,
    exportData,
    importData
  }
}
