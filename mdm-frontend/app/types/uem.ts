// Tipos para UEM - Unified Endpoint Management (Computadores)

export interface Computer {
  id: string
  name: string
  computerId: string
  status: 'online' | 'offline'
  lastSeen: number
  
  // Informações do Sistema
  osType: 'Windows' | 'Linux' | 'macOS' | 'unknown'
  osVersion: string
  osBuild?: string
  architecture: 'x64' | 'x86' | 'ARM64' | 'unknown'
  hostname?: string
  domain?: string
  
  // Hardware
  cpuModel?: string
  cpuCores?: number
  cpuThreads?: number
  memoryTotal: number // em bytes
  memoryUsed: number // em bytes
  storageTotal: number // em bytes
  storageUsed: number // em bytes
  storageDrives?: StorageDrive[]
  
  // Rede
  ipAddress?: string
  macAddress?: string
  networkType?: string
  wifiSSID?: string
  isWifiEnabled?: boolean
  isBluetoothEnabled?: boolean
  
  // Informações do Agente
  agentVersion?: string
  agentInstalledAt?: number
  lastHeartbeat?: number
  
  // Usuário
  loggedInUser?: string
  assignedDeviceUserId?: string | null
  assignedUser?: DeviceUser | null
  assignedUserId?: string | null
  assignedUserName?: string | null
  
  // Conformidade
  complianceStatus?: 'compliant' | 'non_compliant' | 'unknown'
  antivirusInstalled?: boolean
  antivirusEnabled?: boolean
  antivirusName?: string
  firewallEnabled?: boolean
  encryptionEnabled?: boolean
  
  // Restrições
  restrictions: ComputerRestrictions
  
  // Programas instalados
  installedPrograms?: InstalledProgram[]
  installedProgramsCount: number
  
  // Localização (se aplicável)
  latitude?: number
  longitude?: number
  locationAccuracy?: number
  lastLocationUpdate?: number
}

export interface StorageDrive {
  drive: string // C:, D:, etc
  label?: string
  fileSystem?: string
  total: number // bytes
  used: number // bytes
  free: number // bytes
}

export interface InstalledProgram {
  name: string
  version?: string
  publisher?: string
  installDate?: number
  installLocation?: string
  size?: number
}

export interface ComputerRestrictions {
  cameraDisabled?: boolean
  screenCaptureDisabled?: boolean
  bluetoothDisabled?: boolean
  usbDataTransferDisabled?: boolean
  wifiDisabled?: boolean
  factoryResetDisabled?: boolean
  safeBootDisabled?: boolean
  statusBarDisabled?: boolean
  usbDevicesBlocked?: boolean
  cdRomDisabled?: boolean
  printerInstallDisabled?: boolean
  remoteDesktopDisabled?: boolean
}

export interface DeviceUser {
  id: string
  userId: string
  name: string
  cpf: string
  email?: string
  phone?: string
  department?: string
  position?: string
  notes?: string
  isActive: boolean
  devicesCount?: number
  createdAt: string
  updatedAt: string
}

export interface RemoteAction {
  id: string
  name: string
  description: string
  requiresDeviceOwner?: boolean
  requiresConfirmation?: boolean
  dangerous?: boolean
  params?: string[]
}

