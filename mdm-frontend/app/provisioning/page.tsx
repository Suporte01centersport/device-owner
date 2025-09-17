'use client'

import { useState } from 'react'
import QRCode from 'qrcode'

export default function ProvisioningPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [config, setConfig] = useState({
    serverUrl: 'http://192.168.1.100:80',
    wifiSSID: '',
    wifiPassword: '',
    deviceName: 'Tablet MDM',
    restrictions: {
      wifiDisabled: false,
      cameraDisabled: true,
      statusBarDisabled: true
    }
  })

  const generateQRCode = async () => {
    const provisioningData = {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": 
        "com.mdmowner.launcher/.device.MDMDeviceAdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": 
        `${config.serverUrl}/apk/mdm-owner.apk`,
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": 
        "SHA-256:abc123...", // Hash real do APK
      "android.app.extra.PROVISIONING_WIFI_SSID": config.wifiSSID,
      "android.app.extra.PROVISIONING_WIFI_PASSWORD": config.wifiPassword,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        "server_url": config.serverUrl,
        "device_name": config.deviceName,
        "restrictions": JSON.stringify(config.restrictions)
      }
    }

    try {
      const qrString = JSON.stringify(provisioningData)
      const qrCodeDataUrl = await QRCode.toDataURL(qrString, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
      setQrCodeUrl(qrCodeDataUrl)
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Provisionamento de Dispositivo
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Configurações */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800">Configurações</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL do Servidor
                </label>
                <input
                  type="url"
                  value={config.serverUrl}
                  onChange={(e) => setConfig({...config, serverUrl: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  placeholder="http://192.168.1.100:80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SSID do Wi-Fi
                </label>
                <input
                  type="text"
                  value={config.wifiSSID}
                  onChange={(e) => setConfig({...config, wifiSSID: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  placeholder="MinhaRedeWiFi"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Senha do Wi-Fi
                </label>
                <input
                  type="password"
                  value={config.wifiPassword}
                  onChange={(e) => setConfig({...config, wifiPassword: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  placeholder="********"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Dispositivo
                </label>
                <input
                  type="text"
                  value={config.deviceName}
                  onChange={(e) => setConfig({...config, deviceName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  placeholder="Tablet MDM"
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-800">Restrições Iniciais</h3>
                
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={config.restrictions.cameraDisabled}
                    onChange={(e) => setConfig({
                      ...config, 
                      restrictions: {...config.restrictions, cameraDisabled: e.target.checked}
                    })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Bloquear Câmera</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={config.restrictions.statusBarDisabled}
                    onChange={(e) => setConfig({
                      ...config, 
                      restrictions: {...config.restrictions, statusBarDisabled: e.target.checked}
                    })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Bloquear Barra de Status</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={config.restrictions.wifiDisabled}
                    onChange={(e) => setConfig({
                      ...config, 
                      restrictions: {...config.restrictions, wifiDisabled: e.target.checked}
                    })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Bloquear Wi-Fi</span>
                </label>
              </div>

              <button
                onClick={generateQRCode}
                className="w-full btn-secondary"
              >
                Gerar QR Code
              </button>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center space-y-6">
              <h2 className="text-xl font-semibold text-gray-800">QR Code de Provisionamento</h2>
              
              {qrCodeUrl ? (
                <div className="text-center">
                  <img src={qrCodeUrl} alt="QR Code" className="mx-auto mb-4" />
                  <p className="text-sm text-gray-600 mb-4">
                    Escaneie este QR Code durante a configuração inicial do dispositivo
                  </p>
                  <button
                    onClick={() => {
                      const link = document.createElement('a')
                      link.download = 'provisioning-qr-code.png'
                      link.href = qrCodeUrl
                      link.click()
                    }}
                    className="btn-secondary"
                  >
                    Baixar QR Code
                  </button>
                </div>
              ) : (
                <div className="w-64 h-64 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <p className="text-gray-500">QR Code aparecerá aqui</p>
                </div>
              )}
            </div>
          </div>

          {/* Instruções */}
          <div className="mt-12 bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">
              Instruções de Provisionamento
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800">
              <li>Faça um factory reset no dispositivo Android</li>
              <li>Na tela de boas-vindas, toque 6 vezes na palavra "Bem-vindo"</li>
              <li>Escaneie o QR Code gerado acima</li>
              <li>Aguarde o download e instalação automática do MDM Owner</li>
              <li>O dispositivo será configurado automaticamente como Device Owner</li>
            </ol>
          </div>

          {/* Método alternativo via ADB */}
          <div className="mt-8 bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Método Alternativo - ADB
            </h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p><strong>1.</strong> Instale o APK no dispositivo</p>
              <p><strong>2.</strong> Execute o comando ADB:</p>
              <code className="block bg-gray-800 text-green-400 p-3 rounded mt-2">
                adb shell dpm set-device-owner com.mdmowner.launcher/.device.MDMDeviceAdminReceiver
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
