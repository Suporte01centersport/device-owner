'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import ConfirmModal from './ConfirmModal'
import { showAlert } from '../lib/dialog'

interface UpdateAppModalProps {
  device: Device | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (apkUrl: string, version: string) => void
}

export default function UpdateAppModal({ device, isOpen, onClose, onConfirm }: UpdateAppModalProps) {
  const [apkUrl, setApkUrl] = useState('')
  const [version, setVersion] = useState('1.1')
  const [showConfirm, setShowConfirm] = useState(false)
  const [loadingUrl, setLoadingUrl] = useState(false)

  // Carregar URL do APK MDM ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setLoadingUrl(true)
      fetch('/api/apk-url')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.url) {
            setApkUrl(data.url)
          } else {
            setApkUrl('')
          }
        })
        .catch(() => setApkUrl(''))
        .finally(() => setLoadingUrl(false))
    }
  }, [isOpen])

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen || !device) return null

  const handleConfirmClick = () => {
    if (!apkUrl.trim()) {
      showAlert('Por favor, insira a URL do APK')
      return
    }
    setShowConfirm(true)
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    onConfirm(apkUrl, version)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📥 Atualizar Aplicativo</h2>
          <button 
            onClick={onClose}
            className="modal-close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Dispositivo:</strong> {device.name}
            </p>
            <p className="text-sm text-blue-800">
              <strong>Modelo:</strong> {device.model}
            </p>
            <p className="text-sm text-blue-800">
              <strong>Status:</strong> {device.status === 'online' ? '🟢 Online' : '🔴 Offline'}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                URL do APK MDM *
              </label>
              <input
                type="url"
                value={apkUrl}
                onChange={(e) => setApkUrl(e.target.value)}
                placeholder={loadingUrl ? 'Carregando URL do servidor...' : 'http://IP:3001/apk/mdm.apk'}
                className="input w-full"
                disabled={loadingUrl}
              />
              <p className="text-xs text-muted mt-1">
                {loadingUrl ? 'Obtendo URL do servidor...' : 'URL do APK MDM (gerada automaticamente). Use "Atualizar em massa" para fazer o build primeiro.'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                Versão (opcional)
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.1"
                className="input w-full"
              />
              <p className="text-xs text-muted mt-1">
                Identificação da versão para controle interno
              </p>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Atenção</h3>
              <ul className="text-xs text-yellow-700 space-y-1">
                <li>• O dispositivo deve estar online</li>
                <li>• O app será atualizado automaticamente (Device Owner)</li>
                <li>• O download será feito via internet móvel/WiFi</li>
                <li>• O dispositivo pode reiniciar após a instalação</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancelar
          </button>
          <button 
            onClick={handleConfirmClick}
            className="btn btn-success"
            disabled={!apkUrl.trim()}
          >
            📥 Atualizar Agora
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Tem certeza?"
        message={`Deseja atualizar o APK do dispositivo "${device.name}"? O download e instalação serão iniciados.`}
        confirmLabel="Sim"
        cancelLabel="Não"
        variant="primary"
      />
    </div>
  )
}

