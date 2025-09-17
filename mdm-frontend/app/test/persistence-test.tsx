'use client'

import { useState, useEffect } from 'react'
import { usePersistence } from '../lib/persistence'
import { Device } from '../types/device'

export default function PersistenceTest() {
  const {
    devices,
    adminPassword,
    isLoaded,
    updateDevices,
    updateAdminPassword,
    clearAllData,
    hasSavedData,
    exportData,
    importData
  } = usePersistence()

  const [testResults, setTestResults] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const runPersistenceTests = async () => {
    setIsRunning(true)
    setTestResults([])
    
    addResult('🧪 Iniciando testes de persistência...')
    
    // Teste 1: Verificar carregamento inicial
    addResult(`✅ Dados carregados: ${isLoaded ? 'Sim' : 'Não'}`)
    addResult(`📱 Dispositivos carregados: ${devices.length}`)
    addResult(`🔐 Senha carregada: ${adminPassword ? 'Sim' : 'Não'}`)
    
    // Teste 2: Adicionar dispositivo de teste
    const testDevice: Device = {
      id: 'test-device-1',
      deviceId: 'test-device-1',
      name: 'Dispositivo de Teste',
      status: 'online',
      lastSeen: Date.now(),
      androidVersion: '14',
      model: 'Test Model',
      manufacturer: 'Test Manufacturer',
      apiLevel: 34,
      batteryLevel: 85,
      batteryStatus: 'charging',
      isCharging: true,
      storageTotal: 128000000000,
      storageUsed: 64000000000,
      memoryTotal: 8000000000,
      memoryUsed: 4000000000,
      cpuArchitecture: 'arm64-v8a',
      screenResolution: '1080x2400',
      screenDensity: 420,
      networkType: 'wifi',
      isWifiEnabled: true,
      isBluetoothEnabled: true,
      isLocationEnabled: true,
      isDeveloperOptionsEnabled: false,
      isAdbEnabled: false,
      isUnknownSourcesEnabled: false,
      installedAppsCount: 25,
      isDeviceOwner: true,
      isProfileOwner: true,
      appVersion: '1.0.0',
      timezone: 'America/Sao_Paulo',
      language: 'pt-BR',
      country: 'BR',
      restrictions: {
        wifiDisabled: false,
        bluetoothDisabled: false,
        cameraDisabled: false,
        statusBarDisabled: false,
        installAppsDisabled: false,
        uninstallAppsDisabled: false,
        settingsDisabled: false,
        systemNotificationsDisabled: false,
        screenCaptureDisabled: false,
        sharingDisabled: false,
        outgoingCallsDisabled: false,
        smsDisabled: false,
        userCreationDisabled: false,
        userRemovalDisabled: false
      },
      latitude: -23.5505,
      longitude: -46.6333,
      locationAccuracy: 10,
      lastLocationUpdate: Date.now(),
      address: 'São Paulo, SP, Brasil',
      locationProvider: 'gps'
    }
    
    addResult('📱 Adicionando dispositivo de teste...')
    updateDevices(prev => [...prev, testDevice])
    
    // Aguardar um pouco para o debounce
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Teste 3: Verificar se foi salvo
    const hasData = hasSavedData()
    addResult(`💾 Dados salvos: ${hasData ? 'Sim' : 'Não'}`)
    
    // Teste 4: Atualizar senha de administrador
    addResult('🔐 Atualizando senha de administrador...')
    updateAdminPassword('teste123')
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Teste 5: Exportar dados
    addResult('📤 Exportando dados...')
    const exportedData = exportData()
    addResult(`📊 Dados exportados: ${JSON.stringify(exportedData).length} caracteres`)
    
    // Teste 6: Limpar dados
    addResult('🗑️ Limpando dados...')
    clearAllData()
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Teste 7: Verificar se foi limpo
    const hasDataAfterClear = hasSavedData()
    addResult(`🧹 Dados após limpeza: ${hasDataAfterClear ? 'Ainda existem' : 'Limpos'}`)
    
    // Teste 8: Importar dados
    addResult('📥 Importando dados...')
    const importSuccess = importData(exportedData)
    addResult(`📥 Importação: ${importSuccess ? 'Sucesso' : 'Falha'}`)
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Teste 9: Verificar importação
    const hasDataAfterImport = hasSavedData()
    addResult(`📥 Dados após importação: ${hasDataAfterImport ? 'Restaurados' : 'Não restaurados'}`)
    
    addResult('✅ Testes de persistência concluídos!')
    setIsRunning(false)
  }

  const clearResults = () => {
    setTestResults([])
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          🧪 Teste de Persistência de Dados
        </h1>
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Status Atual</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-600 font-medium">Dados Carregados</div>
              <div className="text-2xl font-bold text-blue-800">
                {isLoaded ? '✅' : '❌'}
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-600 font-medium">Dispositivos</div>
              <div className="text-2xl font-bold text-green-800">{devices.length}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-purple-600 font-medium">Senha Admin</div>
              <div className="text-2xl font-bold text-purple-800">
                {adminPassword ? '✅' : '❌'}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Ações de Teste</h2>
          <div className="flex gap-4">
            <button
              onClick={runPersistenceTests}
              disabled={isRunning}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Executando...
                </>
              ) : (
                <>
                  🚀 Executar Testes
                </>
              )}
            </button>
            
            <button
              onClick={clearResults}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              🗑️ Limpar Resultados
            </button>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Resultados dos Testes</h2>
          <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
            {testResults.length === 0 ? (
              <p className="text-gray-500 italic">Nenhum teste executado ainda.</p>
            ) : (
              <div className="space-y-2">
                {testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono text-gray-700">
                    {result}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Dados Atuais</h2>
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="text-xs text-gray-600 overflow-x-auto">
              {JSON.stringify({
                devices: devices.length,
                adminPassword: adminPassword ? '***' : 'não definida',
                hasSavedData: hasSavedData(),
                isLoaded
              }, null, 2)}
            </pre>
          </div>
        </div>

        <div className="text-sm text-gray-500">
          <p><strong>Nota:</strong> Este componente testa a persistência de dados usando localStorage.</p>
          <p>Os dados são salvos automaticamente quando você interage com a aplicação principal.</p>
        </div>
      </div>
    </div>
  )
}
