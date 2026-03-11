/**
 * Lista fixa de apps típicos de um Nokia 50 padrão com conta Google.
 * Inclui WMS e apps comuns do ecossistema Android/Google.
 * Ordem: WMS primeiro (obrigatório), restante em ordem alfabética por appName.
 */
export interface PresetApp {
  packageName: string
  appName: string
  emoji: string
  mandatory?: boolean // WMS é obrigatório
  iconUrl?: string    // URL direta do ícone (Android-style)
}

// Gera URL de ícone do Google Favicon CDN (256px, estilo Android)
const gicon = (domain: string) =>
  `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`

export const PRESET_APPS: PresetApp[] = [
  // WMS - Obrigatório (sempre primeiro)
  {
    packageName: 'com.centersporti.wmsmobile',
    appName: 'WMS',
    emoji: '🏭',
    mandatory: true,
    iconUrl: '/wms-logo.png',
  },
  // Restante em ordem alfabética
  {
    packageName: 'com.android.calculator2',
    appName: 'Calculadora',
    emoji: '🔢',
  },
  {
    packageName: 'com.android.camera2',
    appName: 'Câmera',
    emoji: '📷',
  },
  {
    packageName: 'com.android.chrome',
    appName: 'Chrome',
    emoji: '🌐',
    iconUrl: gicon('chrome.google.com'),
  },
  {
    packageName: 'com.android.settings',
    appName: 'Configurações',
    emoji: '⚙️',
  },
  {
    packageName: 'com.google.android.gm',
    appName: 'Gmail',
    emoji: '✉️',
    iconUrl: gicon('gmail.com'),
  },
  {
    packageName: 'com.google.android.googlequicksearchbox',
    appName: 'Google',
    emoji: '🔍',
    iconUrl: gicon('google.com'),
  },
  {
    packageName: 'com.google.android.calendar',
    appName: 'Google Agenda',
    emoji: '📅',
    iconUrl: gicon('calendar.google.com'),
  },
  {
    packageName: 'com.google.android.apps.docs',
    appName: 'Google Drive',
    emoji: '☁️',
    iconUrl: gicon('drive.google.com'),
  },
  {
    packageName: 'com.google.android.apps.photos',
    appName: 'Google Fotos',
    emoji: '🖼️',
    iconUrl: gicon('photos.google.com'),
  },
  {
    packageName: 'com.google.android.keep',
    appName: 'Google Keep',
    emoji: '📝',
    iconUrl: gicon('keep.google.com'),
  },
  {
    packageName: 'com.google.android.apps.maps',
    appName: 'Google Maps',
    emoji: '🗺️',
    iconUrl: gicon('maps.google.com'),
  },
  {
    packageName: 'com.google.android.apps.tachyon',
    appName: 'Google Meet',
    emoji: '📹',
    iconUrl: gicon('meet.google.com'),
  },
  {
    packageName: 'com.google.android.apps.messaging',
    appName: 'Mensagens',
    emoji: '💬',
    iconUrl: 'https://www.gstatic.com/images/branding/product/2x/messages_48dp.png',
  },
  {
    packageName: 'com.android.vending',
    appName: 'Play Store',
    emoji: '🛒',
    iconUrl: gicon('play.google.com'),
  },
  {
    packageName: 'com.google.android.deskclock',
    appName: 'Relógio',
    emoji: '⏰',
    iconUrl: 'https://www.gstatic.com/images/branding/product/2x/google_clock_48dp.png',
  },
  {
    packageName: 'com.google.android.dialer',
    appName: 'Telefone',
    emoji: '☎️',
    iconUrl: gicon('voice.google.com'),
  },
  {
    packageName: 'com.google.android.youtube',
    appName: 'YouTube',
    emoji: '▶️',
    iconUrl: gicon('youtube.com'),
  },
]
