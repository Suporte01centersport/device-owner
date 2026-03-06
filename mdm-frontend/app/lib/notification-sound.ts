/**
 * Som de notificação estilo iPhone (tri-tone).
 * Usa Web Audio API - sem arquivos externos.
 */
export function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, startTime)
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    // Tri-tone: C5, E5, G5 (estilo iPhone)
    playTone(523.25, 0, 0.08)
    playTone(659.25, 0.12, 0.08)
    playTone(783.99, 0.24, 0.12)
  } catch {
    // Silenciar se AudioContext falhar (ex: autoplay bloqueado)
  }
}
