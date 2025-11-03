'use client'

import { useState, useEffect } from 'react'
import UEMCard from '../components/UEM/UEMCard'
import UEMModal from '../components/UEM/UEMModal'
import { Computer } from '../types/uem'

export default function UEMPage() {
  const [computers, setComputers] = useState<Computer[]>([])
  const [selectedComputer, setSelectedComputer] = useState<Computer | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Carregar computadores (mockado por enquanto)
  useEffect(() => {
    const loadComputers = async () => {
      setLoading(true)
      try {
        // TODO: Substituir por chamada real à API
        // Por enquanto, retornar array vazio ou dados mockados
        setComputers([])
      } catch (error) {
        console.error('Erro ao carregar computadores:', error)
      } finally {
        setLoading(false)
      }
    }
    loadComputers()
  }, [])

  const handleComputerClick = (computer: Computer) => {
    setSelectedComputer(computer)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedComputer(null)
  }

  const handleDeleteComputer = (computerId: string) => {
    if (window.confirm('Tem certeza que deseja deletar este computador? Esta ação não pode ser desfeita.')) {
      // TODO: Implementar deleção
      console.log('Deletar computador:', computerId)
      setComputers(prev => prev.filter(c => c.computerId !== computerId))
      handleCloseModal()
    }
  }

  const handleRemoteAction = (computer: Computer) => {
    setSelectedComputer(computer)
    setIsModalOpen(true)
    // O modal já tem a aba de ações remotas, então apenas abre o modal
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">UEM - Computadores</h1>
          <p className="text-secondary mt-1">Gerenciar computadores e ações remotas</p>
        </div>
        <div className="flex gap-3">
          <button 
            className="btn btn-primary"
            onClick={() => {
              // TODO: Implementar adicionar novo computador
              alert('Funcionalidade de adicionar computador será implementada em breve')
            }}
          >
            <span>➕</span>
            Adicionar Computador
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando computadores...</p>
          </div>
        </div>
      ) : computers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow">
            <span className="text-3xl">💻</span>
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">Nenhum computador conectado</h3>
          <p className="text-secondary mb-6">
            Conecte computadores para começar o gerenciamento UEM
          </p>
          <button 
            className="btn btn-primary btn-lg"
            onClick={() => {
              // TODO: Implementar adicionar novo computador
              alert('Funcionalidade de adicionar computador será implementada em breve')
            }}
          >
            <span>💻</span>
            Conectar Primeiro Computador
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {computers.map((computer) => (
            <UEMCard
              key={computer.computerId}
              computer={computer}
              onClick={() => handleComputerClick(computer)}
              onDelete={() => handleDeleteComputer(computer.computerId)}
              onRemoteAction={() => handleRemoteAction(computer)}
            />
          ))}
        </div>
      )}

      {/* Computer Modal */}
      {isModalOpen && selectedComputer && (
        <UEMModal
          computer={selectedComputer}
          onClose={handleCloseModal}
          onDelete={handleDeleteComputer}
        />
      )}
    </div>
  )
}

