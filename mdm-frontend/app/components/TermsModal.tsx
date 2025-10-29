'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Device } from '../types/device'

interface TermsModalProps {
  isOpen: boolean
  onClose: () => void
  device: Device
  assignedUser: {
    name: string
    cpf: string
  } | null
}

interface DeviceEntry {
  description: string
  deliveryDate: string
}

export default function TermsModal({ isOpen, onClose, device, assignedUser }: TermsModalProps) {
  const [deviceEntries, setDeviceEntries] = useState<DeviceEntry[]>([
    {
      description: '', // Totalmente manual
      deliveryDate: new Date().toLocaleDateString('pt-BR'),
    }
  ])

  const currentDate = new Date().toLocaleDateString('pt-BR')
  const deviceCodInv = device.name || 'Dispositivo' // COD INV. = nome do dispositivo

  const handleAddDeviceEntry = () => {
    setDeviceEntries([...deviceEntries, {
      description: '',
      deliveryDate: new Date().toLocaleDateString('pt-BR'),
    }])
  }

  const handleRemoveDeviceEntry = (index: number) => {
    if (deviceEntries.length > 1) {
      setDeviceEntries(deviceEntries.filter((_, i) => i !== index))
    }
  }

  const handleUpdateEntry = useCallback((index: number, field: keyof DeviceEntry, value: string) => {
    setDeviceEntries(prev => prev.map((entry, i) => 
      i === index ? { ...entry, [field]: value } : entry
    ))
  }, [])

  const handlePrint = () => {
    // Primeiro, sincroniza os valores na área de impressão com o estado
    const printTextareas = document.querySelectorAll('#print-area textarea.term-input') as NodeListOf<HTMLTextAreaElement>
    printTextareas.forEach((textarea, idx) => {
      const entryIdx = idx % deviceEntries.length // Para os termos duplicados
      if (deviceEntries[entryIdx]) {
        textarea.value = deviceEntries[entryIdx].description
      }
      
      // Remove todas as restrições
      textarea.style.height = 'auto'
      textarea.style.minHeight = 'auto'
      textarea.style.maxHeight = 'none'
      textarea.style.overflow = 'visible'
      textarea.style.overflowY = 'visible'
      textarea.style.whiteSpace = 'pre-wrap'
      textarea.style.wordWrap = 'break-word'
      textarea.style.width = '100%'
    })
    
    // Aguarda o layout ser recalculado
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Recalcula alturas após o layout ser aplicado
        printTextareas.forEach((textarea) => {
          textarea.style.height = 'auto'
          const scrollHeight = textarea.scrollHeight || 20
          textarea.style.height = `${Math.max(scrollHeight, 20)}px`
        })
        
        // Delay adicional para garantir que os ajustes sejam aplicados
        setTimeout(() => {
          window.print()
        }, 200)
      })
    })
  }

  // Função para auto-resize do textarea (síncrona para uso em eventos)
  const autoResizeTextarea = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [])

  // Ref para armazenar os valores anteriores e evitar ajustes desnecessários
  const previousValuesRef = useRef<string[]>([])
  const previousHashRef = useRef<string>('')
  const justBlurredRef = useRef<Set<number>>(new Set())
  
  // Ajusta os textareas apenas quando o modal abre ou quando entries são adicionados/removidos
  useEffect(() => {
    if (!isOpen) return
    
    // Cria um array com os valores atuais de description
    const currentValues = deviceEntries.map(entry => entry.description || '')
    
    // Cria um hash simples para comparação rápida
    const currentHash = currentValues.join('|||')
    
    // Se há textareas que acabaram de perder o foco, não executa o useEffect
    // para evitar conflitos - eles já foram ajustados no onBlur
    if (justBlurredRef.current.size > 0) {
      return
    }
    
    // Verifica se realmente houve mudança nos valores usando hash
    const valuesChanged = currentHash !== previousHashRef.current || 
      currentValues.length !== previousValuesRef.current.length
    
    if (!valuesChanged && previousHashRef.current !== '') {
      // Não houve mudança relevante, não precisa ajustar
      return
    }
    
    // Atualiza as refs com os valores atuais
    previousValuesRef.current = currentValues
    previousHashRef.current = currentHash
    
    const timer = setTimeout(() => {
      const textareas = document.querySelectorAll('textarea.term-input') as NodeListOf<HTMLTextAreaElement>
      textareas.forEach((textarea, idx) => {
        // Sincroniza valor apenas se não estiver focado e se mudou externamente
        if (document.activeElement !== textarea && deviceEntries[idx]) {
          const currentValue = textarea.value
          const expectedValue = deviceEntries[idx].description
          if (currentValue !== expectedValue) {
            textarea.value = expectedValue
            autoResizeTextarea(textarea)
          }
          // Se o valor não mudou, NÃO ajusta - evita oscilação
        }
        // Se está focado, NÃO faz nada - deixa o usuário digitar em paz
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [deviceEntries, isOpen, autoResizeTextarea]) // deviceEntries completo, mas comparação por hash evita ajustes desnecessários

  // Componente do Termo (será duplicado na impressão) - EXATAMENTE COMO NA IMAGEM
  const TermContent = () => (
    <div className="term-single" style={{ 
      fontFamily: 'Arial, sans-serif', 
      fontSize: '9pt',
      border: '1px solid #000',
      padding: '10px 15px',
      marginBottom: '1cm',
      width: '100%',
      boxSizing: 'border-box',
      height: 'auto'
    }}>
      {/* Header - EXATAMENTE COMO NA IMAGEM */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '10px'
      }}>
        {/* Esquerda: "PE" */}
        <div style={{ 
          fontSize: '14pt', 
          fontWeight: 'bold',
          width: '15%'
        }}>
          PE
        </div>
        
        {/* Centro: Título */}
        <div style={{ 
          fontSize: '18pt', 
          fontWeight: 'bold',
          textTransform: 'uppercase',
          flex: 1,
          textAlign: 'center',
          marginTop: '-4px'
        }}>
          TERMO DE RESPONSABILIADE
        </div>
        
        {/* Direita: DATA */}
        <div style={{ 
          width: '15%',
          textAlign: 'right',
          fontSize: '11pt'
        }}>
          DATA: {currentDate}
        </div>
      </div>

      {/* Declaração - Texto completo */}
      <div style={{ 
        textAlign: 'justify',
        marginBottom: '8px',
        lineHeight: '1.4',
        fontSize: '9pt'
      }}>
        <p style={{ margin: 0 }}>
          Declaro que, nesta data, fica sob minha responsabilidade os Materiais/Equipamentos abaixo relacionados, 
          devendo ser devolvidos no ato de minha recisão contratual ou quando solicitados por parte da Empresa, 
          nas condições em que me foram entregues, com exceção de marcas de uso que decorrem de desgaste natural.
        </p>
      </div>

      {/* NOME e CPF - Lado a lado */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        marginBottom: '6px',
        fontSize: '9pt'
      }}>
        <div style={{ flex: '0 0 45%' }}>
          <strong>NOME:</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px', display: 'inline-block', minWidth: '200px' }}>{assignedUser?.name || ''}</span>
        </div>
        <div style={{ flex: '0 0 45%', textAlign: 'right' }}>
          <strong>CPF:</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px', display: 'inline-block', minWidth: '150px' }}>{assignedUser?.cpf || ''}</span>
        </div>
      </div>

      {/* Tabela de Materiais */}
      <div style={{ marginBottom: '8px' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '9pt',
          border: '1px solid #000'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt' }}>
                COD INV.
              </th>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt' }}>
                DESCRICAO MATERIAL
              </th>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt' }}>
                DATA DA ENTREGA
              </th>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt' }}>
                DATA DA DEVOLUÇÃO
              </th>
            </tr>
          </thead>
          <tbody>
            {deviceEntries.map((entry, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: '9pt', verticalAlign: 'middle' }}>
                  {deviceCodInv}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', verticalAlign: 'middle' }}>
                  <textarea
                    key={`desc-${index}`}
                    defaultValue={entry.description}
                    onBlur={(e) => {
                      const textarea = e.target as HTMLTextAreaElement
                      // Marca que este textarea acabou de perder o foco
                      justBlurredRef.current.add(index)
                      // Atualiza estado quando perde o foco
                      handleUpdateEntry(index, 'description', textarea.value)
                      // Ajusta a altura uma vez após o blur
                      requestAnimationFrame(() => {
                        autoResizeTextarea(textarea)
                      })
                      // Limpa a marca após um delay suficiente para evitar que o useEffect interfira
                      setTimeout(() => {
                        justBlurredRef.current.delete(index)
                      }, 200)
                    }}
                    onInput={(e) => {
                      const textarea = e.target as HTMLTextAreaElement
                      textarea.style.height = 'auto'
                      textarea.style.height = `${textarea.scrollHeight}px`
                    }}
                    className="term-input"
                    placeholder="Descrição do material"
                    rows={1}
                    style={{ 
                      width: '100%', 
                      border: 'none', 
                      outline: 'none',
                      fontSize: '9pt',
                      backgroundColor: 'transparent',
                      resize: 'none',
                      overflow: 'hidden',
                      minHeight: '20px',
                      lineHeight: '1.4',
                      fontFamily: 'inherit'
                    }}
                  />
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', verticalAlign: 'middle' }}>
                  <input
                    type="text"
                    value={entry.deliveryDate}
                    onChange={(e) => handleUpdateEntry(index, 'deliveryDate', e.target.value)}
                    className="term-input"
                    placeholder="Data de entrega"
                    style={{ 
                      width: '100%', 
                      border: 'none', 
                      outline: 'none',
                      fontSize: '9pt',
                      backgroundColor: 'transparent'
                    }}
                  />
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', verticalAlign: 'middle' }}>
                  &nbsp;
                </td>
                {deviceEntries.length > 1 && (
                  <td className="print:hidden" style={{ padding: '4px', verticalAlign: 'middle' }}>
                    <button
                      onClick={() => handleRemoveDeviceEntry(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                      type="button"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={handleAddDeviceEntry}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800 print:hidden"
          type="button"
        >
          + Adicionar material
        </button>
      </div>

      {/* Cláusula de Acordo */}
      <div style={{ 
        textAlign: 'justify',
        marginBottom: '12px',
        lineHeight: '1.4',
        fontSize: '9pt',
        marginTop: '8px'
      }}>
        <p style={{ margin: 0 }}>
          Concordo que a falta ou má conservação das ferramentas acima citadas resultará em descontos em minha 
          folha de pagamento no valor da nota fiscal de aquisição do produto, tais descontos ocorrerão até o limite 
          de 30% do meu salário (até que se atinja o valor total do item) e para o caso de recisão de meu contrato 
          de trabalho, o desconto será realizado em sua totalidade.
        </p>
      </div>

      {/* Linha para assinatura */}
      <div style={{ 
        marginTop: '35px',
        textAlign: 'center'
      }}>
        <div style={{ 
          margin: '0 auto',
          width: '70%',
          maxWidth: '400px'
        }}>
          <div style={{ 
            borderTop: '2px solid #000',
            paddingTop: '8px'
          }}></div>
          <div style={{ 
            fontWeight: 'bold',
            textTransform: 'uppercase',
            fontSize: '9pt',
            lineHeight: '1.2',
            marginTop: '2px'
          }}>
            ASSINATURA DO FUNCIONARIO
          </div>
        </div>
      </div>
    </div>
  )

  if (!isOpen) return null

  return (
    <>
      {/* Modal para edição */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 modal-overlay">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto modal-content">
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-xl font-bold">Termo de Responsabilidade</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {/* Body - Documento */}
          <div className="p-6 print:hidden">
            <TermContent />
          </div>

          {/* Footer com Botões */}
          <div className="flex justify-end gap-3 p-6 border-t print:hidden">
            <button
              onClick={handlePrint}
              className="btn btn-primary"
            >
              <span>🖨️</span>
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Área de impressão - dois termos idênticos em A4 (oculta na tela, visível apenas na impressão) */}
      <div id="print-area" style={{ display: 'none' }}>
        <div className="print-page-a4">
          <TermContent />
          <TermContent />
        </div>
      </div>

      {/* Estilos para impressão A4 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 1.91cm 1.9cm;
          }

          body * {
            visibility: hidden;
          }

          #print-area,
          #print-area * {
            visibility: visible;
          }

          #print-area {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
          }

          .print-page-a4 {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background: white;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            page-break-after: avoid;
            box-sizing: border-box;
            transform: scale(1); /* Escala padrão (100%) */
          }

          .term-single {
            page-break-inside: avoid;
            flex: 0 0 auto;
            margin-bottom: 0.8cm;
            height: auto;
          }

          .term-single:last-child {
            margin-bottom: 0;
          }

          .print\\:hidden {
            display: none !important;
          }

          .modal-overlay,
          .modal-content,
          .modal-header,
          .modal-footer {
            display: none !important;
          }

          .term-input {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            outline: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }

          textarea.term-input {
            resize: none !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            display: block !important;
            appearance: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: textfield !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            outline: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            font-family: inherit !important;
            font-size: inherit !important;
            line-height: inherit !important;
            color: inherit !important;
          }
          
          textarea.term-input::-webkit-inner-spin-button,
          textarea.term-input::-webkit-outer-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
          }
          
          textarea.term-input::-webkit-search-decoration,
          textarea.term-input::-webkit-search-cancel-button {
            -webkit-appearance: none !important;
          }

          table {
            border-collapse: collapse;
            width: 100%;
            table-layout: auto !important;
          }
          
          tr {
            height: auto !important;
          }

          th, td {
            border: 1px solid black;
          }
          
          td {
            vertical-align: middle !important;
            height: auto !important;
            overflow: visible !important;
          }
          
          /* Garante que células com textarea tenham altura adequada na impressão */
          td textarea.term-input {
            min-height: 20px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            white-space: pre-wrap !important;
            line-height: 1.4 !important;
            display: block !important;
            position: relative !important;
          }
        }
      `}</style>
    </>
  )
}
