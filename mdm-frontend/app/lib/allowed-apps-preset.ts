/**
 * Lista fixa de apps típicos de um Nokia 50 padrão com conta Google.
 * Inclui WMS e apps comuns do ecossistema Android/Google.
 */
export interface PresetApp {
  packageName: string
  appName: string
  emoji: string
}

export const PRESET_APPS: PresetApp[] = [
  // WMS e apps prioritários
  { packageName: 'com.centersporti.wmsmobile', appName: 'WMS', emoji: '📦' },
  // Telefone e comunicação (apenas Google)
  { packageName: 'com.google.android.dialer', appName: 'Telefone (Google)', emoji: '📞' },
  { packageName: 'com.android.contacts', appName: 'Contatos', emoji: '👤' },
  { packageName: 'com.google.android.contacts', appName: 'Contatos (Google)', emoji: '👤' },
  { packageName: 'com.google.android.apps.messaging', appName: 'Mensagens', emoji: '💬' },
  { packageName: 'com.android.mms', appName: 'SMS', emoji: '💬' },
  // Email e produtividade
  { packageName: 'com.google.android.gm', appName: 'Gmail', emoji: '✉️' },
  { packageName: 'com.google.android.apps.docs', appName: 'Google Drive', emoji: '📁' },
  { packageName: 'com.google.android.apps.tachyon', appName: 'Google Meet', emoji: '📹' },
  { packageName: 'com.google.android.calendar', appName: 'Google Agenda', emoji: '📅' },
  { packageName: 'com.google.android.keep', appName: 'Google Keep', emoji: '📝' },
  // Navegador e mapas
  { packageName: 'com.android.chrome', appName: 'Chrome', emoji: '🌐' },
  { packageName: 'com.google.android.apps.maps', appName: 'Google Maps', emoji: '🗺️' },
  { packageName: 'com.google.android.googlequicksearchbox', appName: 'Google', emoji: '🔍' },
  // Mídia e entretenimento
  { packageName: 'com.google.android.youtube', appName: 'YouTube', emoji: '▶️' },
  { packageName: 'com.google.android.apps.photos', appName: 'Google Fotos', emoji: '📷' },
  // Utilitários
  { packageName: 'com.android.calculator2', appName: 'Calculadora', emoji: '🔢' },
  { packageName: 'com.android.deskclock', appName: 'Relógio', emoji: '⏰' },
  { packageName: 'com.google.android.deskclock', appName: 'Relógio (Google)', emoji: '⏰' },
  { packageName: 'com.android.camera2', appName: 'Câmera', emoji: '📸' },
  { packageName: 'com.android.documentsui', appName: 'Arquivos', emoji: '📂' },
  { packageName: 'com.google.android.apps.nbu.files', appName: 'Arquivos (Google)', emoji: '📂' },
  // Loja e sistema
  { packageName: 'com.android.vending', appName: 'Play Store', emoji: '🛒' },
  { packageName: 'com.android.settings', appName: 'Configurações', emoji: '⚙️' },
  { packageName: 'com.google.android.settings', appName: 'Configurações (Google)', emoji: '⚙️' },
]
