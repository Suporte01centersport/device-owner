import { NextRequest, NextResponse } from 'next/server'

// Lista de ações remotas disponíveis
const AVAILABLE_ACTIONS = [
  {
    id: 'lock_device',
    name: 'Bloquear Dispositivo',
    description: 'Bloqueia a tela do dispositivo imediatamente',
    requiresDeviceOwner: true,
    requiresConfirmation: false
  },
  {
    id: 'reboot_device',
    name: 'Reiniciar Dispositivo',
    description: 'Reinicia o dispositivo remotamente',
    requiresDeviceOwner: true,
    requiresConfirmation: true
  },
  {
    id: 'wipe_device',
    name: 'Factory Reset',
    description: 'Apaga todos os dados do dispositivo (IRREVERSÍVEL)',
    requiresDeviceOwner: true,
    requiresConfirmation: true,
    dangerous: true
  },
  {
    id: 'set_kiosk_mode',
    name: 'Modo Quiosque',
    description: 'Fixa um aplicativo na tela (lock task mode)',
    requiresDeviceOwner: true,
    requiresConfirmation: false,
    params: ['packageName', 'enabled']
  },
  {
    id: 'disable_camera',
    name: 'Desabilitar Câmera',
    description: 'Desabilita ou habilita a câmera do dispositivo',
    requiresDeviceOwner: true,
    requiresConfirmation: false,
    params: ['disabled']
  },
  {
    id: 'clear_app_cache',
    name: 'Limpar Cache de App',
    description: 'Limpa o cache de um aplicativo específico',
    requiresDeviceOwner: false,
    requiresConfirmation: false,
    params: ['packageName']
  },
  {
    id: 'uninstall_app',
    name: 'Desinstalar Aplicativo',
    description: 'Remove um aplicativo do dispositivo',
    requiresDeviceOwner: true,
    requiresConfirmation: true,
    params: ['packageName']
  },
  {
    id: 'install_app',
    name: 'Instalar Aplicativo',
    description: 'Instala um aplicativo remotamente via URL',
    requiresDeviceOwner: true,
    requiresConfirmation: false,
    params: ['url']
  }
]

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      actions: AVAILABLE_ACTIONS,
      totalActions: AVAILABLE_ACTIONS.length
    })
  } catch (error) {
    console.error('Erro ao listar ações:', error)
    return NextResponse.json(
      { error: 'Erro ao listar ações disponíveis' },
      { status: 500 }
    )
  }
}

