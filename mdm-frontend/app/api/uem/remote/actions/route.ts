import { NextRequest, NextResponse } from 'next/server'

// Lista de ações remotas disponíveis para computadores (UEM)
const AVAILABLE_ACTIONS = [
  {
    id: 'lock_device',
    name: 'Bloquear Computador',
    description: 'Bloqueia a tela do computador imediatamente',
    requiresDeviceOwner: false,
    requiresConfirmation: false
  },
  {
    id: 'reboot_device',
    name: 'Reiniciar Computador',
    description: 'Reinicia o computador remotamente',
    requiresDeviceOwner: false,
    requiresConfirmation: true
  },
  {
    id: 'shutdown_device',
    name: 'Desligar Computador',
    description: 'Desliga o computador remotamente',
    requiresDeviceOwner: false,
    requiresConfirmation: true
  },
  {
    id: 'wipe_device',
    name: 'Resetar Computador',
    description: 'Reseta o computador para configurações de fábrica (IRREVERSÍVEL)',
    requiresDeviceOwner: false,
    requiresConfirmation: true,
    dangerous: true
  },
  {
    id: 'disable_camera',
    name: 'Desabilitar Câmera',
    description: 'Desabilita ou habilita a câmera do computador',
    requiresDeviceOwner: false,
    requiresConfirmation: false,
    params: ['disabled']
  },
  {
    id: 'disable_usb',
    name: 'Desabilitar USB',
    description: 'Bloqueia transferência de dados via USB',
    requiresDeviceOwner: false,
    requiresConfirmation: false,
    params: ['disabled']
  },
  {
    id: 'run_script',
    name: 'Executar Script',
    description: 'Executa um script PowerShell/Bash no computador',
    requiresDeviceOwner: false,
    requiresConfirmation: true,
    params: ['script', 'type']
  },
  {
    id: 'install_software',
    name: 'Instalar Software',
    description: 'Instala um software remotamente via URL ou pacote',
    requiresDeviceOwner: false,
    requiresConfirmation: false,
    params: ['url', 'installer']
  },
  {
    id: 'uninstall_software',
    name: 'Desinstalar Software',
    description: 'Remove um software do computador',
    requiresDeviceOwner: false,
    requiresConfirmation: true,
    params: ['name', 'version']
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

