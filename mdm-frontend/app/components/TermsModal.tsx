'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, Page, Text, View, StyleSheet, pdf, Font } from '@react-pdf/renderer'
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
  height?: number // Altura salva do textarea
  codInv?: string
  codHeight?: number
}

const CACHE_KEY = 'terms-modal-temp-cache'

export default function TermsModal({ isOpen, onClose, device, assignedUser }: TermsModalProps) {
  // Quebra palavras longas na renderização do PDF (evita estouro de coluna)
  try {
    Font.registerHyphenationCallback((word) => {
      // Não hifeniza palavras curtas (mantém headers em uma linha)
      if (!word) return []
      if (word.length < 30) return [word]
      // Para palavras muito longas (ex.: sequências de 'a'), permite quebrazinhas
      return word.split('')
    })
  } catch {}
  // Carrega do cache se existir, senão cria novo
  const loadFromCache = (): DeviceEntry[] => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        // Valida se tem pelo menos um entry
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.error('Erro ao carregar cache:', e)
    }
    // Retorna padrão se não há cache
    return [{
      description: '',
      deliveryDate: new Date().toLocaleDateString('pt-BR'),
      codInv: device.name || '',
    }]
  }

  const [deviceEntries, setDeviceEntries] = useState<DeviceEntry[]>(loadFromCache)

  const currentDate = new Date().toLocaleDateString('pt-BR')
  const deviceCodInv = device.name || 'Dispositivo' // COD INV. padrão (1ª linha)

  // Removido soft-wrap no PDF para manter quebra natural por limite da célula

  const handleAddDeviceEntry = () => {
    // Salva estados de todos os textareas ANTES de adicionar novo entry
    const textareas = document.querySelectorAll('textarea[data-entry-index]') as NodeListOf<HTMLTextAreaElement>
    const savedStates: Array<{ index: number; height: string; content: string; adjusted: boolean }> = []
    // Salva estados dos textareas de COD INV também
    const codTextareas = document.querySelectorAll('textarea[data-cod-index]') as NodeListOf<HTMLTextAreaElement>
    const savedCodStates: Array<{ index: number; height: string; content: string; adjusted: boolean }> = []
    
    textareas.forEach((textarea) => {
      const index = parseInt(textarea.getAttribute('data-entry-index') || '-1')
      if (index >= 0) {
        // Salva altura calculada baseada no conteúdo atual
        textarea.style.height = 'auto'
        const calculatedHeight = Math.max(textarea.scrollHeight, 20)
        
        savedStates.push({
          index,
          height: `${calculatedHeight}px`,
          content: textarea.value,
          adjusted: textarea.getAttribute('data-adjusted') === 'true'
        })
        
        // Atualiza estado no React ANTES de adicionar novo
        handleUpdateEntry(index, 'description', textarea.value)
      }
    })
    // Salva estado dos COD INV
    codTextareas.forEach((textarea) => {
      const index = parseInt(textarea.getAttribute('data-cod-index') || '-1')
      if (index >= 0) {
        textarea.style.height = 'auto'
        const calculatedHeight = Math.max(textarea.scrollHeight, 20)
        savedCodStates.push({
          index,
          height: `${calculatedHeight}px`,
          content: textarea.value,
          adjusted: textarea.getAttribute('data-adjusted') === 'true'
        })
        // Atualiza estado do COD INV antes de adicionar
        handleUpdateEntry(index, 'codInv', textarea.value)
      }
    })
    
    // Adiciona novo entry e salva no cache
    setDeviceEntries(prev => {
      const updated = [...prev, {
        description: '',
        deliveryDate: new Date().toLocaleDateString('pt-BR'),
        codInv: '', // novas linhas começam vazias para personalização
      }]
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      } catch (e) {
        console.error('Erro ao salvar cache:', e)
      }
      return updated
    })
    
    // Restaura estados após re-render (usando requestAnimationFrame + setTimeout)
    requestAnimationFrame(() => {
      setTimeout(() => {
        const newTextareas = document.querySelectorAll('textarea[data-entry-index]') as NodeListOf<HTMLTextAreaElement>
        newTextareas.forEach((textarea) => {
          const index = parseInt(textarea.getAttribute('data-entry-index') || '-1')
          const savedState = savedStates.find(s => s.index === index)
          
          if (savedState) {
            // Restaura conteúdo
            textarea.value = savedState.content
            
            // Restaura altura calculada corretamente
            textarea.style.height = 'auto'
            const heightValue = parseInt(savedState.height.replace('px', '')) || 20
            const restoredHeight = Math.max(textarea.scrollHeight, heightValue)
            textarea.style.height = `${restoredHeight}px`
            
            // Restaura marcações se estava ajustado
            if (savedState.adjusted) {
              textarea.setAttribute('data-adjusted', 'true')
              textarea.setAttribute('data-adjusted-height', `${restoredHeight}`)
              textarea.setAttribute('data-adjusted-content', savedState.content)
              adjustedTextareasRef.current.add(index)
              
              // Reforça altura em mais frames para garantir persistência
              requestAnimationFrame(() => {
                if (textarea.style.height !== `${restoredHeight}px`) {
                  textarea.style.height = `${restoredHeight}px`
                }
                requestAnimationFrame(() => {
                  if (textarea.style.height !== `${restoredHeight}px`) {
                    textarea.style.height = `${restoredHeight}px`
                  }
                })
              })
            } else {
              // Se não estava ajustado, apenas ajusta inicialmente
              textarea.style.height = 'auto'
              autoResizeTextarea(textarea)
            }
          }
        })
        // Restaura estados dos COD INV
        const newCodTextareas = document.querySelectorAll('textarea[data-cod-index]') as NodeListOf<HTMLTextAreaElement>
        newCodTextareas.forEach((textarea) => {
          const index = parseInt(textarea.getAttribute('data-cod-index') || '-1')
          const savedState = savedCodStates.find(s => s.index === index)
          if (savedState) {
            textarea.value = savedState.content
            textarea.style.height = 'auto'
            const heightValue = parseInt(savedState.height.replace('px', '')) || 20
            const restoredHeight = Math.max(textarea.scrollHeight, heightValue)
            textarea.style.height = `${restoredHeight}px`
            if (savedState.adjusted) {
              textarea.setAttribute('data-adjusted', 'true')
              textarea.setAttribute('data-adjusted-height', `${restoredHeight}`)
              textarea.setAttribute('data-adjusted-content', savedState.content)
              requestAnimationFrame(() => {
                if (textarea.style.height !== `${restoredHeight}px`) {
                  textarea.style.height = `${restoredHeight}px`
                }
                requestAnimationFrame(() => {
                  if (textarea.style.height !== `${restoredHeight}px`) {
                    textarea.style.height = `${restoredHeight}px`
                  }
                })
              })
            } else {
              textarea.style.height = 'auto'
              const h = Math.max(textarea.scrollHeight, 20)
              textarea.style.height = `${h}px`
            }
          }
        })
      }, 50)
    })
  }

  const handleRemoveDeviceEntry = (index: number) => {
    if (deviceEntries.length > 1) {
      setDeviceEntries(prev => {
        const updated = prev.filter((_, i) => i !== index)
        // Salva no cache após remover
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(updated))
        } catch (e) {
          console.error('Erro ao salvar cache:', e)
        }
        return updated
      })
    }
  }

  const handleUpdateEntry = useCallback((index: number, field: keyof DeviceEntry, value: string) => {
    setDeviceEntries(prev => {
      const updated = prev.map((entry, i) => 
        i === index ? { ...entry, [field]: value } : entry
      )
      // Salva no cache após atualização
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      } catch (e) {
        console.error('Erro ao salvar cache:', e)
      }
      return updated
    })
  }, [])

  // Estilos para o PDF
  const pdfStyles = StyleSheet.create({
    page: {
      paddingTop: 30,
      paddingBottom: 20,
      paddingLeft: 30,
      paddingRight: 30,
      fontFamily: 'Helvetica',
      fontSize: 9,
    },
    pageContainer: {
      flexDirection: 'column',
      height: '100%',
    },
    termContainer: {
      borderWidth: 1,
      borderColor: '#000',
      padding: 10,
      paddingLeft: 15,
      paddingRight: 15,
      marginBottom: 16,
      minHeight: 0,
      flexGrow: 0,
      flexShrink: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    pe: {
      fontSize: 14,
      fontWeight: 'bold',
      width: '12%',
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      textTransform: 'uppercase',
      flex: 1,
      textAlign: 'center',
      marginTop: -4,
    },
    date: {
      width: '20%',
      textAlign: 'right',
      fontSize: 11,
    },
    dateText: {
      fontSize: 11,
      wordBreak: 'keep-all',
    },
    declaration: {
      textAlign: 'justify',
      marginBottom: 8,
      lineHeight: 1.4,
      fontSize: 9,
    },
    userInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
      fontSize: 9,
    },
    userField: {
      flexBasis: '45%',
    },
    userFieldRight: {
      flexBasis: '45%',
      textAlign: 'right',
    },
    underline: {
      borderBottomWidth: 1,
      borderBottomColor: '#000',
      paddingLeft: 8,
      paddingRight: 8,
      minWidth: 200,
    },
    tableContainer: {
      width: '100%',
      borderWidth: 1,
      borderColor: '#000',
      marginBottom: 8,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#f0f0f0',
      borderBottomWidth: 1,
      borderBottomColor: '#000',
    },
    // Cabeçalhos com larguras fixas (iguais à tabela do modal HTML)
    tableHeaderCell: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      fontWeight: 'bold',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '15%',
      flexGrow: 0,
      flexShrink: 0,
    },
    // Cabeçalho da coluna de data (20% - igual à Web)
    tableHeaderCellDate: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      fontWeight: 'bold',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '20%',
      flexGrow: 0,
      flexShrink: 0,
    },
    tableHeaderCellDescription: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      fontWeight: 'bold',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '45%',
      flexGrow: 0,
      flexShrink: 0,
    },
    tableHeaderCellLast: {
      padding: 4,
      fontSize: 9,
      fontWeight: 'bold',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '20%',
      flexGrow: 0,
      flexShrink: 0,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#000',
      alignItems: 'stretch',
    },
    tableRowLast: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    // Células com mesmas larguras fixas dos cabeçalhos
    tableCell: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      minHeight: 20,
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '15%',
      flexGrow: 0,
      flexShrink: 0,
    },
    // Célula específica para COD INV. permitindo quebra e expansão de altura
    tableCellCod: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      minHeight: 20,
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '15%',
      flexGrow: 0,
      flexShrink: 0,
      flexWrap: 'wrap',
      flexDirection: 'row',
    },
    // Célula da coluna de data (20% - igual à Web)
    tableCellDate: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      minHeight: 20,
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '20%',
      flexGrow: 0,
      flexShrink: 0,
    },
    tableCellLast: {
      padding: 4,
      fontSize: 9,
      minHeight: 20,
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      width: '20%',
      flexGrow: 0,
      flexShrink: 0,
    },
    tableCellDescription: {
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: '#000',
      fontSize: 9,
      minHeight: 20,
      width: '45%',
      flexGrow: 0,
      flexShrink: 0,
    },
    // Força quebra de palavra longa dentro da descrição
    descriptionText: {
      wordBreak: 'break-word',
      hyphens: 'none',
    },
    // COD INV. com mesma lógica de quebra da descrição
    codText: {
      wordBreak: 'break-word',
      hyphens: 'none',
    },
    agreement: {
      textAlign: 'justify',
      marginBottom: 12,
      marginTop: 8,
      lineHeight: 1.4,
      fontSize: 9,
    },
    signatureArea: {
      marginTop: 20,
      alignItems: 'center',
    },
    signatureLine: {
      width: '70%',
      maxWidth: 400,
      borderTopWidth: 2,
      borderTopColor: '#000',
      paddingTop: 8,
      marginBottom: 2,
    },
    signatureText: {
      fontWeight: 'bold',
      textTransform: 'uppercase',
      fontSize: 9,
      textAlign: 'center',
    },
  })

  // Componente de um único termo (reutilizável)
  const SingleTerm = () => (
    <View style={pdfStyles.termContainer}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.pe}>PE</Text>
        <Text style={pdfStyles.title}>TERMO DE RESPONSABILIDADE</Text>
        <Text wrap={false} style={pdfStyles.dateText}>DATA: {currentDate}</Text>
      </View>

      <Text style={pdfStyles.declaration}>
        Declaro que, nesta data, fica sob minha responsabilidade os Materiais/Equipamentos abaixo relacionados, 
        devendo ser devolvidos no ato de minha recisão contratual ou quando solicitados por parte da Empresa, 
        nas condições em que me foram entregues, com exceção de marcas de uso que decorrem de desgaste natural.
      </Text>

      <View style={pdfStyles.userInfo}>
        <View style={pdfStyles.userField}>
          <Text style={{ fontSize: 9 }}>
            <Text style={{ fontWeight: 'bold' }}>NOME:</Text> <Text>{assignedUser?.name || ' '}</Text>
          </Text>
        </View>
        <View style={pdfStyles.userFieldRight}>
          <Text style={{ fontSize: 9 }}>
            <Text style={{ fontWeight: 'bold' }}>CPF:</Text> <Text>{assignedUser?.cpf || ' '}</Text>
          </Text>
        </View>
      </View>

      {/* Tabela */}
      <View style={pdfStyles.tableContainer}>
        <View style={pdfStyles.tableHeader}>
          <View style={pdfStyles.tableHeaderCell}><Text>COD INV.</Text></View>
          <View style={pdfStyles.tableHeaderCellDescription}><Text>DESCRICAO MATERIAL</Text></View>
          <View style={pdfStyles.tableHeaderCellDate}><Text wrap={false}>{`DATA\u00A0DA\u00A0ENTREGA`}</Text></View>
          <View style={pdfStyles.tableHeaderCellLast}><Text wrap={false}>{`DATA\u00A0DA\u00A0DEVOLUÇÃO`}</Text></View>
        </View>
240|        {deviceEntries.map((entry, index) => (
          <View key={index} style={index === deviceEntries.length - 1 ? pdfStyles.tableRowLast : pdfStyles.tableRow}>
            <View style={pdfStyles.tableCellCod}>
              <Text wrap style={pdfStyles.codText}>{typeof entry.codInv === 'string' ? (entry.codInv || ' ') : (index === 0 ? deviceCodInv : ' ')}</Text>
            </View>
            <View style={pdfStyles.tableCellDescription}>
              <Text wrap style={pdfStyles.descriptionText}>{entry.description || ' '}</Text>
            </View>
            <View style={pdfStyles.tableCellDate}>
              <Text>{entry.deliveryDate}</Text>
            </View>
            <View style={pdfStyles.tableCellLast}>
              <Text> </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={pdfStyles.agreement}>
        Concordo que a falta ou má conservação das ferramentas acima citadas resultará em descontos em minha 
        folha de pagamento no valor da nota fiscal de aquisição do produto, tais descontos ocorrerão até o limite 
        de 30% do meu salário (até que se atinja o valor total do item) e para o caso de recisão de meu contrato 
        de trabalho, o desconto será realizado em sua totalidade.
      </Text>

      <View style={pdfStyles.signatureArea}>
        <View style={pdfStyles.signatureLine} />
        <Text style={pdfStyles.signatureText}>ASSINATURA DO FUNCIONARIO</Text>
      </View>
    </View>
  )

  // Componente PDF do Termo
  const TermPDFDocument = () => (
    <Document>
      {/* Página única com dois termos */}
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.pageContainer}>
          <SingleTerm />
          <SingleTerm />
        </View>
      </Page>
    </Document>
  )

  const handlePrint = async () => {
    try {
      // Gera o PDF usando React-PDF
      const doc = <TermPDFDocument />
      const asPdf = pdf(doc)
      const blob = await asPdf.toBlob()
      
      // Abre o PDF em nova aba para impressão/visualização
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      
      // Limpa a URL após um delay
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
      alert('Erro ao gerar PDF. Tente novamente.')
    }
  }

  // Função para auto-resize do textarea
  const autoResizeTextarea = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [])

  // Refs para controlar o textarea
  const adjustedTextareasRef = useRef<Set<number>>(new Set()) // Textareas já ajustados - NÃO mexe mais
  const justBlurredRef = useRef<Set<number>>(new Set())

  // Reset quando o modal fecha
  useEffect(() => {
    if (!isOpen) {
      // Limpa cache temporário quando fecha o modal
      try {
        localStorage.removeItem(CACHE_KEY)
      } catch (e) {
        console.error('Erro ao limpar cache:', e)
      }
      
      adjustedTextareasRef.current.clear()
      justBlurredRef.current.clear()
      // Limpa data attributes de todos os textareas
      const textareas = document.querySelectorAll('textarea.term-input') as NodeListOf<HTMLTextAreaElement>
      textareas.forEach((textarea) => {
        textarea.removeAttribute('data-adjusted')
        textarea.removeAttribute('data-adjusted-height')
      })
    } else {
      // Quando abre o modal, carrega do cache (se houver)
      const cached = loadFromCache()
      if (cached.length > 0) {
        setDeviceEntries(cached)
      }
    }
  }, [isOpen])

  // Ajusta os textareas quando necessário (NÃO interfere nos já ajustados)
  useEffect(() => {
    if (!isOpen) return
    
    const timer = setTimeout(() => {
      const textareas = document.querySelectorAll('textarea.term-input') as NodeListOf<HTMLTextAreaElement>
      textareas.forEach((textarea, idx) => {
        // Não mexe se está focado (usuário digitando)
        if (document.activeElement === textarea) {
          return
        }
        
        // Não mexe se acabou de perder o foco (aguardando processamento)
        if (justBlurredRef.current.has(idx)) {
          return
        }
        
        // Verifica se já foi ajustado através de data attribute
        const isAdjusted = textarea.getAttribute('data-adjusted') === 'true'
        
        if (isAdjusted) {
          // Textarea já foi ajustado - apenas restaura altura se necessário
          const savedHeight = textarea.getAttribute('data-adjusted-height')
          const savedContent = textarea.getAttribute('data-adjusted-content')
          const currentContent = textarea.value
          
          // Se conteúdo não mudou, restaura altura salva
          if (savedContent === currentContent && savedHeight) {
            const currentHeight = textarea.style.height
            const expectedHeight = `${savedHeight}px`
            if (currentHeight !== expectedHeight) {
              textarea.style.height = expectedHeight
            }
          }
          // Se conteúdo mudou, deixa o onBlur tratar quando usuário sair do campo
          return
        }
        
        // Textarea NÃO foi ajustado ainda - sincroniza com estado do React
        if (deviceEntries[idx]) {
          const currentValue = textarea.value
          const expectedValue = deviceEntries[idx].description
          
          // Sincroniza valor se necessário
          if (currentValue !== expectedValue) {
            textarea.value = expectedValue
          }
          
          // Usa altura salva do estado se existir
          if (deviceEntries[idx].height && deviceEntries[idx].height! > 20) {
            textarea.style.height = `${deviceEntries[idx].height}px`
          } else if (!textarea.style.height || textarea.style.height === '' || textarea.style.height === 'auto') {
            // Ajusta altura inicialmente apenas se não tem altura definida
            autoResizeTextarea(textarea)
          }
        }
      })
      // Aplica mesma lógica aos textareas de COD INV
      const codTextareas = document.querySelectorAll('textarea.term-input-cod') as NodeListOf<HTMLTextAreaElement>
      codTextareas.forEach((textarea, idx) => {
        if (document.activeElement === textarea) return
        if (justBlurredRef.current.has(idx)) return

        const isAdjusted = textarea.getAttribute('data-adjusted') === 'true'
        if (isAdjusted) {
          const savedHeight = textarea.getAttribute('data-adjusted-height')
          const savedContent = textarea.getAttribute('data-adjusted-content')
          const currentContent = textarea.value
          if (savedContent === currentContent && savedHeight) {
            const expectedHeight = `${savedHeight}px`
            if (textarea.style.height !== expectedHeight) {
              textarea.style.height = expectedHeight
            }
          }
          return
        }

        if (deviceEntries[idx]) {
          const currentValue = textarea.value
          const expectedValue = typeof deviceEntries[idx].codInv === 'string'
            ? deviceEntries[idx].codInv || (idx === 0 ? deviceCodInv : '')
            : (idx === 0 ? deviceCodInv : '')
          if (currentValue !== expectedValue) {
            textarea.value = expectedValue
          }
          if (deviceEntries[idx].codHeight && deviceEntries[idx].codHeight! > 20) {
            textarea.style.height = `${deviceEntries[idx].codHeight}px`
          } else if (!textarea.style.height || textarea.style.height === '' || textarea.style.height === 'auto') {
            textarea.style.height = 'auto'
            const h = Math.max(textarea.scrollHeight, 20)
            textarea.style.height = `${h}px`
          }
        }
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [deviceEntries.length, isOpen, autoResizeTextarea]) // Apenas quando quantidade muda ou modal abre

  // Garante que textareas ajustados mantenham altura mesmo após re-renders
  useEffect(() => {
    if (!isOpen) return
    
    const timer = setTimeout(() => {
      const textareas = document.querySelectorAll('textarea.term-input') as NodeListOf<HTMLTextAreaElement>
      textareas.forEach((textarea, idx) => {
        // Verifica se foi ajustado através do data attribute
        const isAdjusted = textarea.getAttribute('data-adjusted') === 'true'
        const savedHeight = textarea.getAttribute('data-adjusted-height')
        
        // Se foi ajustado mas perdeu a altura, restaura
        if (isAdjusted && savedHeight) {
          // Não mexe se está focado
          if (document.activeElement === textarea) {
            return
          }
          
          // Verifica se conteúdo mudou
          const savedContent = textarea.getAttribute('data-adjusted-content')
          const currentContent = textarea.value
          
          if (savedContent === currentContent) {
            // Conteúdo não mudou - restaura altura salva
            if (textarea.style.height !== `${savedHeight}px`) {
              textarea.style.height = `${savedHeight}px`
              adjustedTextareasRef.current.add(idx)
            }
          } else {
            // Conteúdo mudou - recalcula
            textarea.style.height = 'auto'
            const newHeight = Math.max(textarea.scrollHeight, 20)
            textarea.style.height = `${newHeight}px`
            textarea.setAttribute('data-adjusted-height', `${newHeight}`)
            textarea.setAttribute('data-adjusted-content', currentContent)
            adjustedTextareasRef.current.add(idx)
          }
        }
      })
      // Mesma garantia para os textareas de COD INV
      const codTextareas = document.querySelectorAll('textarea.term-input-cod') as NodeListOf<HTMLTextAreaElement>
      codTextareas.forEach((textarea, idx) => {
        const isAdjusted = textarea.getAttribute('data-adjusted') === 'true'
        const savedHeight = textarea.getAttribute('data-adjusted-height')
        if (isAdjusted && savedHeight) {
          if (document.activeElement === textarea) return
          const savedContent = textarea.getAttribute('data-adjusted-content')
          const currentContent = textarea.value
          if (savedContent === currentContent) {
            if (textarea.style.height !== `${savedHeight}px`) {
              textarea.style.height = `${savedHeight}px`
              adjustedTextareasRef.current.add(idx)
            }
          } else {
            textarea.style.height = 'auto'
            const newHeight = Math.max(textarea.scrollHeight, 20)
            textarea.style.height = `${newHeight}px`
            textarea.setAttribute('data-adjusted-height', `${newHeight}`)
            textarea.setAttribute('data-adjusted-content', currentContent)
            adjustedTextareasRef.current.add(idx)
          }
        }
      })
    }, 50)
    
    return () => clearTimeout(timer)
  }, [deviceEntries, isOpen]) // Monitora mudanças que podem causar re-render

  // Componente HTML do Termo (para edição)
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
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '10px'
      }}>
        <div style={{ 
          fontSize: '14pt', 
          fontWeight: 'bold',
          width: '15%'
        }}>
          PE
        </div>
        
        <div style={{ 
          fontSize: '18pt', 
          fontWeight: 'bold',
          textTransform: 'uppercase',
          flex: 1,
          textAlign: 'center',
          marginTop: '-4px'
        }}>
          TERMO DE RESPONSABILIDADE
        </div>
        
        <div style={{ 
          width: '15%',
          textAlign: 'right',
          fontSize: '11pt'
        }}>
          DATA: {currentDate}
        </div>
      </div>

      {/* Declaração */}
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

      {/* NOME e CPF */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        marginBottom: '6px',
        fontSize: '9pt'
      }}>
        <div style={{ flex: '0 0 45%' }}>
          <strong>NOME:</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px', display: 'inline-block' }}>{assignedUser?.name || ' '}</span>
        </div>
        <div style={{ flex: '0 0 45%', textAlign: 'right' }}>
          <strong>CPF:</strong> <span style={{ borderBottom: '1px solid #000', padding: '0 8px', display: 'inline-block' }}>{assignedUser?.cpf || ' '}</span>
        </div>
      </div>

      {/* Tabela de Materiais */}
      <div style={{ marginBottom: '8px' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '9pt',
          border: '1px solid #000',
          tableLayout: 'auto'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt', width: '15%' }}>
                COD INV.
              </th>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt', width: '45%' }}>
                DESCRICAO MATERIAL
              </th>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt', width: '20%' }}>
                DATA DA ENTREGA
              </th>
              <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt', width: '20%' }}>
                DATA DA DEVOLUÇÃO
              </th>
            </tr>
          </thead>
          <tbody>
            {deviceEntries.map((entry, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: '9pt', verticalAlign: 'middle' }}>
                  <textarea
                    key={`cod-${index}`}
                    defaultValue={
                      typeof entry.codInv === 'string'
                        ? (entry.codInv || (index === 0 ? deviceCodInv : ''))
                        : (index === 0 ? deviceCodInv : '')
                    }
                    data-cod-index={index}
                    onBlur={(e) => {
                      const textarea = e.target as HTMLTextAreaElement
                      // Calcula altura final antes de salvar estado
                      textarea.style.height = 'auto'
                      const finalHeight = Math.max(textarea.scrollHeight, 20)
                      textarea.style.height = `${finalHeight}px`

                      // Marca e persiste nos data-attributes (reforça em re-render)
                      textarea.setAttribute('data-adjusted', 'true')
                      textarea.setAttribute('data-adjusted-height', `${finalHeight}`)
                      textarea.setAttribute('data-adjusted-content', textarea.value)

                      // Salva conteúdo e altura no estado/cache
                      setDeviceEntries(prev => {
                        const updated = prev.map((row, i) => 
                          i === index ? { ...row, codInv: textarea.value, codHeight: finalHeight } : row
                        )
                        try {
                          localStorage.setItem(CACHE_KEY, JSON.stringify(updated))
                        } catch (e) {
                          console.error('Erro ao salvar cache:', e)
                        }
                        return updated
                      })

                      // Reforça após re-render
                      const enforceHeight = () => {
                        const current = document.querySelector(`textarea[data-cod-index="${index}"]`) as HTMLTextAreaElement | null
                        if (!current) return
                        const savedContent = current.getAttribute('data-adjusted-content')
                        if (savedContent === current.value) {
                          current.style.height = `${finalHeight}px`
                        } else {
                          current.style.height = 'auto'
                          const newHeight = Math.max(current.scrollHeight, 20)
                          current.style.height = `${newHeight}px`
                          current.setAttribute('data-adjusted-height', `${newHeight}`)
                          current.setAttribute('data-adjusted-content', current.value)
                        }
                        current.setAttribute('data-adjusted', 'true')
                      }
                      requestAnimationFrame(() => {
                        enforceHeight()
                        requestAnimationFrame(() => enforceHeight())
                      })
                    }}
                    onInput={(e) => {
                      const textarea = e.target as HTMLTextAreaElement
                      textarea.style.height = 'auto'
                      const newHeight = Math.max(textarea.scrollHeight, 20)
                      textarea.style.height = `${newHeight}px`
                    }}
                    className="term-input-cod"
                    placeholder="Código inventário"
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
                      fontFamily: 'inherit',
                      height: entry.codHeight && entry.codHeight > 20 ? `${entry.codHeight}px` : 'auto'
                    }}
                  />
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', verticalAlign: 'middle' }}>
                  <textarea
                    key={`desc-${index}`}
                    defaultValue={entry.description}
                    data-entry-index={index}
                    onBlur={(e) => {
                      const textarea = e.target as HTMLTextAreaElement
                      justBlurredRef.current.add(index)
                      
                      // Calcula o tamanho final ANTES de atualizar o estado
                      textarea.style.height = 'auto'
                      const finalHeight = Math.max(textarea.scrollHeight, 20)
                      
                      // Define altura baseada no conteúdo atual (dinâmico)
                      textarea.style.height = `${finalHeight}px`
                      // Não usa minHeight - permite flexibilidade
                      
                      // Marca como ajustado ANTES de atualizar estado (evita conflito)
                      adjustedTextareasRef.current.add(index)
                      
                      // Salva estado atual (tamanho + conteúdo)
                      textarea.setAttribute('data-adjusted', 'true')
                      textarea.setAttribute('data-adjusted-height', `${finalHeight}`)
                      textarea.setAttribute('data-adjusted-content', textarea.value)
                      
                      // Salva altura NO ESTADO junto com o conteúdo
                      setDeviceEntries(prev => {
                        const updated = prev.map((entry, i) => 
                          i === index ? { ...entry, description: textarea.value, height: finalHeight } : entry
                        )
                        // Salva no cache
                        try {
                          localStorage.setItem(CACHE_KEY, JSON.stringify(updated))
                        } catch (e) {
                          console.error('Erro ao salvar cache:', e)
                        }
                        return updated
                      })
                      
                      // Função para reforçar usando data-entry-index (funciona após re-render)
                      const enforceHeight = () => {
                        const currentTextarea = document.querySelector(`textarea[data-entry-index="${index}"]`) as HTMLTextAreaElement
                        if (currentTextarea) {
                          const savedContent = currentTextarea.getAttribute('data-adjusted-content')
                          if (savedContent === currentTextarea.value) {
                            // Conteúdo não mudou - mantém tamanho salvo
                            currentTextarea.style.height = `${finalHeight}px`
                          } else {
                            // Conteúdo mudou - recalcula
                            currentTextarea.style.height = 'auto'
                            const newHeight = Math.max(currentTextarea.scrollHeight, 20)
                            currentTextarea.style.height = `${newHeight}px`
                            currentTextarea.setAttribute('data-adjusted-height', `${newHeight}`)
                            currentTextarea.setAttribute('data-adjusted-content', currentTextarea.value)
                          }
                          currentTextarea.setAttribute('data-adjusted', 'true')
                        }
                      }
                      
                      // Reforça em múltiplos momentos para garantir persistência
                      requestAnimationFrame(() => {
                        enforceHeight()
                        requestAnimationFrame(() => {
                          enforceHeight()
                          setTimeout(() => enforceHeight(), 100)
                        })
                      })
                      
                      // Remove proteção após delay
                      setTimeout(() => {
                        justBlurredRef.current.delete(index)
                      }, 500)
                    }}
                    onInput={(e) => {
                      const textarea = e.target as HTMLTextAreaElement
                      // Remove qualquer altura fixa para permitir recalcular dinamicamente
                      textarea.style.height = 'auto'
                      textarea.style.minHeight = 'auto'
                      
                      // Ajusta dinamicamente ao tamanho do conteúdo (pode aumentar ou diminuir)
                      const newHeight = Math.max(textarea.scrollHeight, 20)
                      textarea.style.height = `${newHeight}px`
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
                      fontFamily: 'inherit',
                      height: entry.height && entry.height > 20 ? `${entry.height}px` : 'auto'
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
                  <td style={{ padding: '4px', verticalAlign: 'middle' }}>
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
          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto">
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
          <div className="p-6">
            <TermContent />
          </div>

          {/* Footer com Botões */}
          <div className="flex justify-end gap-3 p-6 border-t">
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
    </>
  )
}
