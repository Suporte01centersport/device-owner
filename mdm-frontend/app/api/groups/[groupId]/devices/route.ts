import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../../../server/database/models/DeviceGroup.js'

// POST - Adicionar dispositivo ao grupo
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { deviceId, assignedBy } = body

    if (!groupId || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'ID do grupo e ID do dispositivo são obrigatórios' },
        { status: 400 }
      )
    }

    const membership = await DeviceGroupModel.addDevice(groupId, deviceId, assignedBy || null)

    return NextResponse.json({ success: true, data: membership })
  } catch (error: any) {
    console.error('Erro ao adicionar dispositivo ao grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Remover dispositivo do grupo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    if (!groupId || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'ID do grupo e ID do dispositivo são obrigatórios' },
        { status: 400 }
      )
    }

    const removed = await DeviceGroupModel.removeDevice(groupId, deviceId)

    return NextResponse.json({ success: true, removed })
  } catch (error: any) {
    console.error('Erro ao remover dispositivo do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// GET - Listar dispositivos do grupo
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    const devices = await DeviceGroupModel.getGroupDevices(groupId)
    
    // Buscar dados em tempo real do WebSocket server PRIMEIRO (prioridade)
    let realtimeDevices: Record<string, any> = {}
    try {
      const hostname = process.env.WEBSOCKET_HOST || 'localhost'
      const wsPort = process.env.WEBSOCKET_PORT || '3002'
      const realtimeRes = await fetch(`http://${hostname}:${wsPort}/api/devices/realtime`)
      if (realtimeRes.ok) {
        const realtimeData = await realtimeRes.json()
        if (realtimeData.success && Array.isArray(realtimeData.data)) {
          // Criar mapa por deviceId para busca rápida
          realtimeData.data.forEach((dev: any) => {
            if (dev.deviceId) {
              realtimeDevices[dev.deviceId] = dev
            }
          })
          // Dados em tempo real carregados com sucesso
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados em tempo real:', error)
      // Continuar sem dados em tempo real
    }


    // Mapear campos do PostgreSQL (snake_case) para o formato esperado pelo frontend (camelCase)
    // E mesclar com dados em tempo real do WebSocket
    const normalizedDevices = devices.map((device: any) => {
      // Tentar encontrar deviceId: primeiro device_id, depois serial_number, depois buscar nos dados em tempo real
      let deviceId = device.device_id || device.deviceId || device.serial_number
      
      // Se ainda não encontrou, tentar buscar nos dados em tempo real pelo nome ou outras características
      if (!deviceId && device.name) {
        const foundRealtime = Object.values(realtimeDevices).find((d: any) => d.name === device.name)
        if (foundRealtime) {
          deviceId = foundRealtime.deviceId
        }
      }
      
      const realtimeData = deviceId ? (realtimeDevices[deviceId] || {}) : {}
      
      return {
        id: device.id,
        deviceId: deviceId || device.device_id || device.deviceId || device.serial_number,
        name: device.name || device.model || 'Dispositivo Desconhecido',
        model: device.model,
        manufacturer: device.manufacturer,
        androidVersion: device.android_version || device.androidVersion,
        osType: device.os_type || device.osType || 'Android',
        apiLevel: device.api_level || device.apiLevel,
        serialNumber: device.serial_number || device.serialNumber,
        imei: device.imei,
        meid: device.meid,
        macAddress: device.mac_address || device.macAddress,
        ipAddress: realtimeData.ipAddress || device.ip_address || device.ipAddress,
        batteryLevel: realtimeData.batteryLevel !== undefined ? realtimeData.batteryLevel : (device.battery_level || device.batteryLevel || 0),
        batteryStatus: realtimeData.batteryStatus || device.battery_status || device.batteryStatus,
        isCharging: realtimeData.isCharging !== undefined ? realtimeData.isCharging : (device.is_charging || device.isCharging || false),
        storageTotal: device.storage_total || device.storageTotal || 0,
        storageUsed: device.storage_used || device.storageUsed || 0,
        memoryTotal: device.memory_total || device.memoryTotal || 0,
        memoryUsed: device.memory_used || device.memoryUsed || 0,
        cpuArchitecture: device.cpu_architecture || device.cpuArchitecture,
        screenResolution: device.screen_resolution || device.screenResolution,
        screenDensity: device.screen_density || device.screenDensity,
        networkType: realtimeData.networkType || device.network_type || device.networkType,
        wifiSSID: realtimeData.wifiSSID || device.wifi_ssid || device.wifiSSID,
        isWifiEnabled: realtimeData.isWifiEnabled !== undefined ? realtimeData.isWifiEnabled : (device.is_wifi_enabled !== undefined ? device.is_wifi_enabled : (device.isWifiEnabled !== undefined ? device.isWifiEnabled : false)),
        isBluetoothEnabled: device.is_bluetooth_enabled !== undefined ? device.is_bluetooth_enabled : (device.isBluetoothEnabled !== undefined ? device.isBluetoothEnabled : false),
        isLocationEnabled: device.is_location_enabled !== undefined ? device.is_location_enabled : (device.isLocationEnabled !== undefined ? device.isLocationEnabled : false),
        isDeveloperOptionsEnabled: device.is_developer_options_enabled !== undefined ? device.is_developer_options_enabled : (device.isDeveloperOptionsEnabled !== undefined ? device.isDeveloperOptionsEnabled : false),
        isAdbEnabled: device.is_adb_enabled !== undefined ? device.is_adb_enabled : (device.isAdbEnabled !== undefined ? device.isAdbEnabled : false),
        isUnknownSourcesEnabled: device.is_unknown_sources_enabled !== undefined ? device.is_unknown_sources_enabled : (device.isUnknownSourcesEnabled !== undefined ? device.isUnknownSourcesEnabled : false),
        installedAppsCount: device.installedAppsCount || 0,
        isDeviceOwner: device.is_device_owner || device.isDeviceOwner || false,
        isProfileOwner: device.is_profile_owner || device.isProfileOwner || false,
        appVersion: device.app_version || device.appVersion || '',
        timezone: device.timezone || '',
        language: device.language || '',
        country: device.country || '',
        complianceStatus: device.compliance_status || device.complianceStatus || 'unknown',
        status: realtimeData.status || device.status || 'offline',
        lastSeen: realtimeData.lastSeen || (device.last_seen ? new Date(device.last_seen).getTime() : (device.lastSeen || Date.now())),
        // Campos de localização (prioridade: dados em tempo real > device_locations > device)
        latitude: realtimeData.latitude !== undefined ? realtimeData.latitude : (device.location_latitude || device.latitude || undefined),
        longitude: realtimeData.longitude !== undefined ? realtimeData.longitude : (device.location_longitude || device.longitude || undefined),
        locationAccuracy: device.location_accuracy || device.locationAccuracy || undefined,
        lastLocationUpdate: realtimeData.lastLocationUpdate || (device.location_created_at 
          ? new Date(device.location_created_at).getTime() 
          : (device.last_location_update ? new Date(device.last_location_update).getTime() : (device.lastLocationUpdate || undefined))),
        address: realtimeData.address || device.location_address || device.address || device.locationAddress || undefined,
        lastKnownLocation: device.last_known_location || device.lastKnownLocation || undefined,
        locationProvider: realtimeData.locationProvider || device.location_provider || device.locationProvider || undefined,
        // Campos de usuário vinculado
        assignedDeviceUserId: device.assigned_device_user_id || device.assignedDeviceUserId,
        assignedUserId: device.assignedUserId,
        assignedUserName: device.assignedUserName || device.user_name,
        assignedUserCpf: device.assignedUserCpf || device.user_cpf,
        // Restrições
        restrictions: device.restrictions || {
          wifiDisabled: device.wifi_disabled || false,
          bluetoothDisabled: device.bluetooth_disabled || false,
          cameraDisabled: device.camera_disabled || false,
          statusBarDisabled: device.status_bar_disabled || false,
          installAppsDisabled: device.install_apps_disabled || false,
          uninstallAppsDisabled: device.uninstall_apps_disabled || false,
          settingsDisabled: device.settings_disabled || false,
          systemNotificationsDisabled: device.system_notifications_disabled || false,
          screenCaptureDisabled: device.screen_capture_disabled || false,
          sharingDisabled: device.sharing_disabled || false,
          outgoingCallsDisabled: device.outgoing_calls_disabled || false,
          smsDisabled: device.sms_disabled || false,
          userCreationDisabled: device.user_creation_disabled || false,
          userRemovalDisabled: device.user_removal_disabled || false,
        },
      }
    })

    return NextResponse.json({ success: true, data: normalizedDevices })
  } catch (error: any) {
    console.error('Erro ao buscar dispositivos do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}











