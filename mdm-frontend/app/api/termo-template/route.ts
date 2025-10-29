import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const XLSX = require('xlsx')

export async function GET(request: Request) {
  try {
    // Tentar encontrar o arquivo Excel na raiz do projeto
    const excelPath = path.join(process.cwd(), '..', 'Pasta1.xlsx')
    
    if (!fs.existsSync(excelPath)) {
      return NextResponse.json(
        { error: 'Arquivo Excel do termo não encontrado. Coloque Pasta1.xlsx na raiz do projeto.' },
        { status: 404 }
      )
    }

    const fileBuffer = fs.readFileSync(excelPath)
    
    // Ler Excel e converter para JSON
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    
    // Converter para array 2D mantendo células vazias
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      raw: false 
    })

    // Retornar dados do Excel
    return NextResponse.json({ 
      data,
      sheetName: firstSheetName
    })
  } catch (error: any) {
    console.error('Erro ao processar arquivo Excel:', error)
    return NextResponse.json(
      { error: 'Erro ao processar arquivo Excel', details: error.message },
      { status: 500 }
    )
  }
}

