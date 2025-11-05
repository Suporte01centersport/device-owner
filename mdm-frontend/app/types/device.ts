export interface Device {
  id: string
  name: string
  deviceId: string
  status: 'online' | 'offline'
  lastSeen: number
  androidVersion?: string
  osType?: string
  deviceType?: 'mobile' | 'computer' // Tipo de dispositivo: mobile (Android) ou computer (Windows/Linux/Mac)
  model: string
  manufacturer: string
  apiLevel: number
  serialNumber?: string
  imei?: string
  meid?: string
  macAddress?: string
  ipAddress?: string
  batteryLevel: number
  batteryStatus: string
  isCharging: boolean
  storageTotal: number
  storageUsed: number
  memoryTotal: number
  memoryUsed: number
  cpuArchitecture: string
  screenResolution: string
  screenDensity: number
  networkType: string
  wifiSSID?: string
  isWifiEnabled: boolean
  isBluetoothEnabled: boolean
  isLocationEnabled: boolean
  isDeveloperOptionsEnabled: boolean
  isAdbEnabled: boolean
  isUnknownSourcesEnabled: boolean
  installedAppsCount: number
  isDeviceOwner: boolean
  isProfileOwner: boolean
  appVersion: string
  timezone: string
  language: string
  country: string
  complianceStatus?: 'compliant' | 'non_compliant' | 'unknown'
  restrictions: DeviceRestrictions
  installedApps?: AppInfo[]
  allowedApps?: string[]
  // Campos de localização
  latitude?: number
  longitude?: number
  locationAccuracy?: number
  lastLocationUpdate?: number
  address?: string
  lastKnownLocation?: string
  locationProvider?: string
  locationHistoryCount?: number
  // Campos de uso do app
  appUsageData?: AppUsageData
  lastUsageUpdate?: number
  // Campos de usuário vinculado (novo modelo com banco de dados)
  assignedDeviceUserId?: string | null // UUID do device_user
  assignedUser?: DeviceUser | null // Objeto completo do usuário
  // Campos legados (manter por compatibilidade temporária)
  assignedUserId?: string | null
  assignedUserName?: string | null
}

export interface DeviceUser {
  id: string // UUID
  userId: string // ID customizado
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

export interface AppInfo {
  packageName: string
  appName: string
  iconBase64?: string
  isSystemApp: boolean
  isEnabled: boolean
  versionName?: string
  versionCode: number
  installTime: number
  updateTime: number
  isAllowed: boolean
}

export interface DeviceRestrictions {
  wifiDisabled: boolean
  bluetoothDisabled: boolean
  cameraDisabled: boolean
  statusBarDisabled: boolean
  installAppsDisabled: boolean
  uninstallAppsDisabled: boolean
  settingsDisabled: boolean
  systemNotificationsDisabled: boolean
  screenCaptureDisabled: boolean
  sharingDisabled: boolean
  outgoingCallsDisabled: boolean
  smsDisabled: boolean
  userCreationDisabled: boolean
  userRemovalDisabled: boolean
}

export interface DeviceGroup {
  id: string
  name: string
  description?: string
  color: string
  deviceCount: number
  devices: Device[]
  appPolicies: AppPolicy[]
  createdAt: string
  updatedAt: string
}

export interface AppPolicy {
  id: string
  packageName: string
  appName: string
  isAllowed: boolean
  policyType: 'allow' | 'block' | 'require'
  groupName?: string
  groupColor?: string
}

export interface DeviceGroupMembership {
  id: string
  deviceId: string
  groupId: string
  assignedAt: string
  assignedBy: string
}

export interface AppUsageData {
  last_access: string
  access_count: number
  total_time_ms: number
  total_time_formatted: string
  session_count: number
  is_tracking: boolean
  current_session_start: string | null
  accessed_apps?: AccessedAppData[]
}

export interface AccessedAppData {
  packageName: string
  appName: string
  accessTime: number
  accessTimeFormatted: string
  duration: number
  isAllowed: boolean // Se o app está na lista de permitidos
}

export interface AccessedApp {
  packageName: string;
  appName: string;
  accessTime: string;
  accessDate: string;
  duration: number;
  accessCount?: number; // Quantidade de acessos no dia
  iconBase64?: string;
  isAllowed: boolean; // Se o app está na lista de permitidos
}