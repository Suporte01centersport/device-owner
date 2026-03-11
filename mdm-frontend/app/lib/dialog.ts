// Singleton para dialogs customizados — substitui window.alert() e window.confirm()

type AlertFn = (message: string) => Promise<void>
type ConfirmFn = (message: string) => Promise<boolean>

let _alert: AlertFn | null = null
let _confirm: ConfirmFn | null = null

export function registerDialogFns(alertFn: AlertFn, confirmFn: ConfirmFn) {
  _alert = alertFn
  _confirm = confirmFn
}

export async function showAlert(message: string): Promise<void> {
  if (_alert) return _alert(message)
  window.alert(message)
}

export async function showConfirm(message: string): Promise<boolean> {
  if (_confirm) return _confirm(message)
  return window.confirm(message)
}
