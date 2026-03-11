'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import DeviceLocationMap from './DeviceLocationMap'

interface LocationMapModalProps {
  device: Device
  isOpen: boolean
  onClose: () => void
  sendMessage?: (message: any) => void
}

async function fetchAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'pt-BR,pt' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.display_name || null
  } catch {
    return null
  }
}

export default function LocationMapModal({ device, isOpen, onClose, sendMessage }: LocationMapModalProps) {
  const [address, setAddress] = useState<string | null>(device.address || null)
  const [loadingAddress, setLoadingAddress] = useState(false)

  const lat = device.latitude
  const lng = device.longitude
  const hasCoords = lat != null && lng != null

  useEffect(() => {
    if (!isOpen || !hasCoords) return
    if (device.address) {
      setAddress(device.address)
      return
    }
    setLoadingAddress(true)
    fetchAddress(lat!, lng!)
      .then((a) => setAddress(a))
      .finally(() => setLoadingAddress(false))
  }, [isOpen, lat, lng, device.address, hasCoords])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
            <span>📍</span>
            Localização - {device.name}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
          >
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {!hasCoords ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">⏳</div>
              <p className="text-primary font-medium">Aguardando localização...</p>
              <p className="text-sm text-secondary mt-2">
                Solicite a localização e aguarde o dispositivo responder.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 bg-surface rounded-lg border border-border">
                <div className="text-xs font-medium text-secondary mb-1">Endereço</div>
                {loadingAddress ? (
                  <div className="flex items-center gap-2 text-primary">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                    Carregando...
                  </div>
                ) : address ? (
                  <p className="text-primary">{address}</p>
                ) : (
                  <p className="text-muted">Endereço não disponível</p>
                )}
                <div className="text-xs text-muted mt-2">
                  Coordenadas: {lat!.toFixed(6)}, {lng!.toFixed(6)}
                  {device.locationAccuracy != null && (
                    <> · Precisão: ~{device.locationAccuracy.toFixed(0)}m</>
                  )}
                </div>
              </div>
              <DeviceLocationMap device={device} className="rounded-lg" sendMessage={sendMessage} />
            </>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <button onClick={onClose} className="btn btn-primary w-full">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
