import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../../server/database/config'

// GET /api/devices/export - exporta dispositivos como CSV com todos os campos
export async function GET(request: NextRequest) {
  try {
    const result = await query(`
      SELECT
        d.device_id,
        d.name,
        d.model,
        d.manufacturer,
        d.android_version,
        d.api_level,
        d.serial_number,
        d.imei,
        d.meid,
        d.mac_address,
        d.ip_address,
        d.status,
        d.battery_level,
        d.battery_status,
        d.is_charging,
        d.storage_total,
        d.storage_used,
        d.memory_total,
        d.memory_used,
        d.cpu_architecture,
        d.screen_resolution,
        d.network_type,
        d.wifi_ssid,
        d.is_wifi_enabled,
        d.is_bluetooth_enabled,
        d.is_location_enabled,
        d.is_device_owner,
        d.is_kiosk_mode,
        d.app_version,
        d.timezone,
        d.language,
        d.sim_number,
        d.phone_number,
        d.is_rooted,
        d.lost_mode,
        d.lost_mode_message,
        d.data_usage_bytes,
        d.compliance_status,
        du.name as user_name,
        du.cpf as user_cpf,
        du.department as user_department,
        d.last_seen,
        d.created_at,
        dl.latitude as last_latitude,
        dl.longitude as last_longitude,
        dl.address as last_address,
        dl.created_at as last_location_time
      FROM devices d
      LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, address, created_at
        FROM device_locations
        WHERE device_id = d.id
        ORDER BY created_at DESC
        LIMIT 1
      ) dl ON true
      WHERE d.deleted_at IS NULL
      ORDER BY d.name ASC
    `)

    const headers = [
      'ID Dispositivo',
      'Nome',
      'Modelo',
      'Fabricante',
      'Versão Android',
      'API Level',
      'Serial',
      'IMEI',
      'MEID',
      'MAC Address',
      'IP',
      'Status',
      'Bateria (%)',
      'Status Bateria',
      'Carregando',
      'Armazenamento Total (GB)',
      'Armazenamento Usado (GB)',
      'Memória RAM Total (GB)',
      'Memória RAM Usada (GB)',
      'Arquitetura CPU',
      'Resolução Tela',
      'Tipo Rede',
      'WiFi SSID',
      'WiFi Ativo',
      'Bluetooth Ativo',
      'Localização Ativa',
      'Device Owner',
      'Modo Kiosk',
      'Versão App MDM',
      'Fuso Horário',
      'Idioma',
      'Número SIM',
      'Telefone',
      'Root Detectado',
      'Modo Perdido',
      'Mensagem Modo Perdido',
      'Uso de Dados (MB)',
      'Compliance',
      'Usuário Atribuído',
      'CPF Usuário',
      'Departamento',
      'Último Acesso',
      'Data Cadastro',
      'Última Latitude',
      'Última Longitude',
      'Último Endereço',
      'Última Localização (Data)'
    ]

    const escapeCsv = (val: any): string => {
      if (val == null) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const formatBytes = (bytes: any, unit: 'GB' | 'MB' = 'GB'): string => {
      if (bytes == null || bytes === 0) return ''
      const divisor = unit === 'GB' ? (1024 * 1024 * 1024) : (1024 * 1024)
      return (Number(bytes) / divisor).toFixed(2)
    }

    const formatBool = (val: any): string => {
      if (val == null) return ''
      return val ? 'Sim' : 'Não'
    }

    const formatDate = (val: any): string => {
      if (!val) return ''
      try {
        return new Date(val).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      } catch {
        return String(val)
      }
    }

    const rows = (result.rows || []).map((d: any) => [
      escapeCsv(d.device_id),
      escapeCsv(d.name),
      escapeCsv(d.model),
      escapeCsv(d.manufacturer),
      escapeCsv(d.android_version),
      escapeCsv(d.api_level),
      escapeCsv(d.serial_number),
      escapeCsv(d.imei),
      escapeCsv(d.meid),
      escapeCsv(d.mac_address),
      escapeCsv(d.ip_address),
      escapeCsv(d.status === 'online' ? 'Online' : 'Offline'),
      escapeCsv(d.battery_level != null ? d.battery_level : ''),
      escapeCsv(d.battery_status),
      escapeCsv(formatBool(d.is_charging)),
      escapeCsv(formatBytes(d.storage_total, 'GB')),
      escapeCsv(formatBytes(d.storage_used, 'GB')),
      escapeCsv(formatBytes(d.memory_total, 'GB')),
      escapeCsv(formatBytes(d.memory_used, 'GB')),
      escapeCsv(d.cpu_architecture),
      escapeCsv(d.screen_resolution),
      escapeCsv(d.network_type),
      escapeCsv(d.wifi_ssid),
      escapeCsv(formatBool(d.is_wifi_enabled)),
      escapeCsv(formatBool(d.is_bluetooth_enabled)),
      escapeCsv(formatBool(d.is_location_enabled)),
      escapeCsv(formatBool(d.is_device_owner)),
      escapeCsv(formatBool(d.is_kiosk_mode)),
      escapeCsv(d.app_version),
      escapeCsv(d.timezone),
      escapeCsv(d.language),
      escapeCsv(d.sim_number),
      escapeCsv(d.phone_number),
      escapeCsv(formatBool(d.is_rooted)),
      escapeCsv(formatBool(d.lost_mode)),
      escapeCsv(d.lost_mode_message),
      escapeCsv(d.data_usage_bytes ? formatBytes(d.data_usage_bytes, 'MB') : ''),
      escapeCsv(d.compliance_status === 'compliant' ? 'Conforme' : d.compliance_status === 'non_compliant' ? 'Não Conforme' : 'Desconhecido'),
      escapeCsv(d.user_name),
      escapeCsv(d.user_cpf),
      escapeCsv(d.user_department),
      escapeCsv(formatDate(d.last_seen)),
      escapeCsv(formatDate(d.created_at)),
      escapeCsv(d.last_latitude),
      escapeCsv(d.last_longitude),
      escapeCsv(d.last_address),
      escapeCsv(formatDate(d.last_location_time))
    ].join(';'))

    // Usar ; como separador para melhor compatibilidade com Excel BR
    const csv = [headers.join(';'), ...rows].join('\r\n')
    const bom = '\uFEFF'
    const filename = `dispositivos-completo-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error: any) {
    console.error('Erro ao exportar dispositivos:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('econnrefused')) {
      return new NextResponse('\uFEFF' + 'Erro: banco de dados indisponível\r\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="dispositivos-erro.csv"`
        }
      })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
