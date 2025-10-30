import { NextRequest, NextResponse } from 'next/server';

/**
 * API para buscar usuários de uma planilha (Google Sheets ou OneDrive)
 * GET /api/users/from-sheet?url=URL_DA_PLANILHA
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sheetUrl = searchParams.get('url');

    if (!sheetUrl) {
      return NextResponse.json(
        { success: false, error: 'URL da planilha não fornecida' },
        { status: 400 }
      );
    }

    console.log('📊 Buscando usuários da planilha:', sheetUrl);
    
    // Detectar tipo de planilha
    if (sheetUrl.includes('docs.google.com/spreadsheets')) {
      console.log('📊 Detectado: Google Sheets');
      return await handleGoogleSheets(sheetUrl);
    }
    
    // Detectar OneDrive e tentar Microsoft Graph API
    if (sheetUrl.includes('1drv.ms') || sheetUrl.includes('onedrive.live.com') || sheetUrl.includes('.sharepoint.com')) {
      console.log('📊 Detectado: OneDrive/SharePoint - tentando Microsoft Graph API');
      return await handleOneDriveGraphAPI(sheetUrl);
    }

    try {
      // Fallback: Converter URL do OneDrive para URL de download direto
      const downloadUrl = convertOneDriveUrlToDownload(sheetUrl);
      
      console.log('📊 Tentando baixar planilha...');

      // Buscar o arquivo Excel
      const response = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        // Sem cache para sempre pegar a versão mais recente
        cache: 'no-store',
        redirect: 'follow'
      });

      console.log(`📊 Status da resposta: ${response.status} ${response.statusText}`);
      console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);

      if (!response.ok) {
        console.error('❌ Erro HTTP ao buscar planilha:', response.status);
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }

      // Obter o arquivo como ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      console.log(`📊 Arquivo baixado: ${arrayBuffer.byteLength} bytes`);
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Arquivo vazio retornado pelo OneDrive');
      }
      
      // Verificar se o conteúdo é HTML (página de erro do OneDrive)
      const buffer = Buffer.from(arrayBuffer);
      const headerString = buffer.toString('utf-8', 0, Math.min(200, buffer.length));
      
      if (headerString.includes('<!DOCTYPE html>') || headerString.includes('<html')) {
        console.error('❌ OneDrive retornou HTML ao invés do arquivo Excel');
        throw new Error('Link inválido ou arquivo não acessível. Verifique as permissões de compartilhamento.');
      }
      
      // Processar planilha Excel
      const users = await parseExcelFile(buffer);

      console.log(`✅ ${users.length} usuários carregados da planilha com sucesso`);

      return NextResponse.json({
        success: true,
        users: users,
        count: users.length
      });

    } catch (error: any) {
      console.error('❌ Erro ao processar planilha:');
      console.error('   Tipo:', error?.name);
      console.error('   Mensagem:', error?.message);
      console.error('   Stack:', error?.stack);
      
      // Retornar erro sem dados de exemplo
      return NextResponse.json({
        success: false,
        users: [],
        count: 0,
        error: error.message || 'Erro ao acessar planilha'
      });
    }

  } catch (error: any) {
    console.error('❌ Erro na API de usuários:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * Converte URL de compartilhamento do OneDrive para URL de download direto
 */
function convertOneDriveUrlToDownload(sheetUrl: string): string {
  try {
    console.log('📊 URL original:', sheetUrl);
    
    // Remover fragmento (#) e espaços
    let cleanUrl = sheetUrl.split('#')[0].trim();
    
    // Método 1: URL curta do OneDrive (1drv.ms)
    if (cleanUrl.includes('1drv.ms')) {
      // Para URLs curtas, adicionar download=1
      const url = new URL(cleanUrl);
      url.searchParams.set('download', '1');
      const downloadUrl = url.toString();
      console.log('📊 Método 1 (1drv.ms):', downloadUrl);
      return downloadUrl;
    }
    
    // Método 2: URL completa do OneDrive
    if (cleanUrl.includes('onedrive.live.com')) {
      const url = new URL(cleanUrl);
      
      // Tentar extrair resid (resource ID)
      const resid = url.searchParams.get('resid') || url.searchParams.get('id');
      const cid = url.searchParams.get('cid');
      
      if (resid && cid) {
        // Criar URL de download direto usando a API do OneDrive
        const downloadUrl = `https://onedrive.live.com/download?resid=${resid}&cid=${cid}`;
        console.log('📊 Método 2 (com resid):', downloadUrl);
        return downloadUrl;
      }
      
      // Fallback: adicionar download=1
      url.searchParams.set('download', '1');
      const downloadUrl = url.toString();
      console.log('📊 Método 2 (fallback):', downloadUrl);
      return downloadUrl;
    }
    
    // Método 3: Link embed do Excel Online
    if (cleanUrl.includes('excel.officeapps.live.com') || cleanUrl.includes('view.officeapps.live.com')) {
      const url = new URL(cleanUrl);
      const src = url.searchParams.get('src') || url.searchParams.get('url');
      
      if (src) {
        console.log('📊 Método 3 (embed):', src);
        return convertOneDriveUrlToDownload(decodeURIComponent(src));
      }
    }
    
    // Fallback final: adicionar download=1
    const separator = cleanUrl.includes('?') ? '&' : '?';
    const downloadUrl = `${cleanUrl}${separator}download=1`;
    console.log('📊 Fallback final:', downloadUrl);
    return downloadUrl;
    
  } catch (error) {
    console.error('❌ Erro ao converter URL:', error);
    return sheetUrl;
  }
}

/**
 * Parseia arquivo Excel usando xlsx library
 */
async function parseExcelFile(buffer: Buffer): Promise<Array<{ id: string; name: string; cpf: string }>> {
  const users: Array<{ id: string; name: string; cpf: string }> = [];
  
  try {
    // Importar xlsx dinamicamente
    const XLSX = require('xlsx');
    
    console.log('📊 Iniciando leitura do arquivo Excel...');
    
    // Ler o arquivo Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Planilha vazia ou sem abas');
    }
    
    // Pegar a primeira planilha
    const sheetName = workbook.SheetNames[0];
    console.log('📊 Lendo aba:', sheetName);
    
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error('Aba da planilha não encontrada');
    }
    
    // Converter para JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log('📊 Total de linhas:', jsonData.length);
    console.log('📊 Primeiras 3 linhas:', jsonData.slice(0, 3));
    
    if (jsonData.length === 0) {
      throw new Error('Planilha sem dados');
    }
    
    // Processar dados (pular primeira linha se for cabeçalho)
    let startRow = 0;
    const firstRow: any = jsonData[0];
    
    // Detectar se primeira linha é cabeçalho (contém "Nome", "CPF", etc)
    if (firstRow && firstRow.length > 0) {
      const firstCellStr = String(firstRow[0] || '').toLowerCase();
      if (firstCellStr.includes('nome') || firstCellStr.includes('name')) {
        console.log('📊 Detectado cabeçalho na linha 1, pulando...');
        startRow = 1;
      }
    }
    
    for (let i = startRow; i < jsonData.length; i++) {
      const row: any = jsonData[i];
      
      if (row && row.length >= 2) {
        const name = row[0]?.toString().trim();
        const cpf = row[1]?.toString().trim();
        const id = row[2]?.toString().trim() || `user_${i}`;
        
        if (name && cpf) {
          users.push({
            id: id,
            name: name,
            cpf: cpf
          });
        }
      }
    }
    
    console.log(`✅ ${users.length} usuários processados com sucesso`);
    
  } catch (error: any) {
    console.error('❌ Erro ao parsear Excel:', error);
    
    // Melhorar mensagem de erro
    if (error.message && error.message.includes('HTML')) {
      throw new Error('Arquivo não é uma planilha Excel válida. Verifique o link de compartilhamento.');
    }
    
    throw new Error(error.message || 'Erro ao processar planilha Excel');
  }
  
  if (users.length === 0) {
    throw new Error('Nenhum dado válido encontrado na planilha. Verifique o formato (Nome, CPF, ID).');
  }
  
  return users;
}

/**
 * Processa OneDrive usando Microsoft Graph API
 */
async function handleOneDriveGraphAPI(sheetUrl: string) {
  try {
    console.log('📊 Processando via Microsoft Graph API...');
    
    // Codificar URL para usar com Graph API
    const encodedUrl = Buffer.from(sheetUrl).toString('base64')
      .replace(/=/g, '')
      .replace(/\//g, '_')
      .replace(/\+/g, '-');
    
    const shareToken = `u!${encodedUrl}`;
    console.log('📊 Share token gerado');
    
    // Obter metadados do arquivo compartilhado
    const driveItemUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem`;
    console.log('📊 Buscando metadados do arquivo...');
    
    const driveItemResponse = await fetch(driveItemUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!driveItemResponse.ok) {
      console.error('❌ Erro ao obter metadados:', driveItemResponse.status);
      throw new Error(`Erro ao acessar arquivo (${driveItemResponse.status}). Verifique se o link é público.`);
    }
    
    const driveItem = await driveItemResponse.json();
    console.log('📊 Arquivo encontrado:', driveItem.name);
    
    // Ler conteúdo da primeira planilha
    const worksheetUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/workbook/worksheets`;
    console.log('📊 Listando abas da planilha...');
    
    const worksheetsResponse = await fetch(worksheetUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!worksheetsResponse.ok) {
      console.error('❌ Erro ao listar abas:', worksheetsResponse.status);
      throw new Error('Erro ao acessar conteúdo da planilha. Verifique se é um arquivo Excel.');
    }
    
    const worksheets = await worksheetsResponse.json();
    
    if (!worksheets.value || worksheets.value.length === 0) {
      throw new Error('Planilha sem abas');
    }
    
    const firstSheet = worksheets.value[0];
    console.log('📊 Lendo aba:', firstSheet.name);
    
    // Ler range usado (todas as células com dados)
    const rangeUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/workbook/worksheets/${firstSheet.id}/usedRange`;
    console.log('📊 Lendo células...');
    
    const rangeResponse = await fetch(rangeUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!rangeResponse.ok) {
      console.error('❌ Erro ao ler células:', rangeResponse.status);
      throw new Error('Erro ao ler dados da planilha');
    }
    
    const rangeData = await rangeResponse.json();
    console.log('📊 Células lidas:', rangeData.rowCount, 'linhas');
    
    // Processar valores
    const users = parseGraphAPIValues(rangeData.values);
    
    console.log(`✅ ${users.length} usuários carregados via Microsoft Graph API`);
    
    return NextResponse.json({
      success: true,
      users: users,
      count: users.length,
      source: 'Microsoft Graph API (OneDrive)'
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao processar via Graph API:', error);
    return NextResponse.json({
      success: false,
      users: [],
      count: 0,
      error: error.message || 'Erro ao acessar OneDrive via Microsoft Graph API'
    });
  }
}

/**
 * Parseia valores retornados pela Graph API
 */
function parseGraphAPIValues(values: any[][]): Array<{ id: string; name: string; cpf: string }> {
  const users: Array<{ id: string; name: string; cpf: string }> = [];
  
  try {
    console.log('📊 Parseando valores da Graph API...');
    console.log('📊 Total de linhas:', values.length);
    
    if (values.length === 0) {
      throw new Error('Planilha vazia');
    }
    
    let startRow = 0;
    
    // Detectar cabeçalho
    if (values.length > 0 && values[0].length > 0) {
      const firstCell = String(values[0][0] || '').toLowerCase();
      if (firstCell.includes('nome') || firstCell.includes('name')) {
        console.log('📊 Cabeçalho detectado na linha 1, pulando...');
        startRow = 1;
      }
    }
    
    for (let i = startRow; i < values.length; i++) {
      const row = values[i];
      
      if (row && row.length >= 2) {
        const name = String(row[0] || '').trim();
        const cpf = String(row[1] || '').trim();
        const id = row[2] ? String(row[2]).trim() : `user_${i}`;
        
        if (name && cpf) {
          users.push({ id, name, cpf });
        }
      }
    }
    
    console.log(`📊 ${users.length} usuários parseados`);
    
  } catch (error) {
    console.error('❌ Erro ao parsear valores:', error);
    throw new Error('Erro ao processar dados da planilha');
  }
  
  if (users.length === 0) {
    throw new Error('Nenhum dado válido encontrado. Formato esperado: Nome, CPF, ID');
  }
  
  return users;
}

/**
 * Processa Google Sheets
 */
async function handleGoogleSheets(sheetUrl: string) {
  try {
    console.log('📊 Processando Google Sheets...');
    
    // Extrair o ID da planilha e converter para CSV export URL
    let sheetId = '';
    let gid = '0'; // primeira aba por padrão
    
    // Formato: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      sheetId = match[1];
    } else {
      throw new Error('URL do Google Sheets inválida');
    }
    
    // Tentar extrair GID (ID da aba) se especificado
    const gidMatch = sheetUrl.match(/[#&]gid=([0-9]+)/);
    if (gidMatch) {
      gid = gidMatch[1];
    }
    
    // URL para exportar como CSV
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    console.log('📊 URL CSV:', csvUrl);
    
    // Buscar o CSV
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`Erro ao acessar Google Sheets: ${response.status}. Verifique se a planilha está pública.`);
    }
    
    const csvText = await response.text();
    console.log('📊 CSV baixado:', csvText.length, 'caracteres');
    
    if (csvText.length === 0) {
      throw new Error('Planilha vazia');
    }
    
    // Parsear CSV
    const users = parseCSV(csvText);
    
    console.log(`✅ ${users.length} usuários carregados do Google Sheets`);
    
    return NextResponse.json({
      success: true,
      users: users,
      count: users.length,
      source: 'Google Sheets'
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao processar Google Sheets:', error);
    return NextResponse.json({
      success: false,
      users: [],
      count: 0,
      error: error.message || 'Erro ao acessar Google Sheets'
    });
  }
}

/**
 * Parseia CSV
 */
function parseCSV(csvText: string): Array<{ id: string; name: string; cpf: string }> {
  const users: Array<{ id: string; name: string; cpf: string }> = [];
  
  try {
    const lines = csvText.split('\n').filter(line => line.trim());
    
    console.log('📊 Total de linhas CSV:', lines.length);
    console.log('📊 Primeira linha:', lines[0]);
    
    let startRow = 0;
    
    // Detectar cabeçalho
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('nome') || firstLine.includes('name') || firstLine.includes('cpf')) {
        console.log('📊 Cabeçalho detectado, pulando primeira linha');
        startRow = 1;
      }
    }
    
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Split por vírgula, mas respeitar aspas
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      if (values.length >= 2) {
        const name = values[0]?.trim();
        const cpf = values[1]?.trim();
        const id = values[2]?.trim() || `user_${i}`;
        
        if (name && cpf) {
          users.push({ id, name, cpf });
        }
      }
    }
    
    console.log(`📊 ${users.length} usuários parseados do CSV`);
    
  } catch (error) {
    console.error('❌ Erro ao parsear CSV:', error);
    throw new Error('Erro ao processar dados do CSV');
  }
  
  if (users.length === 0) {
    throw new Error('Nenhum dado válido encontrado. Formato esperado: Nome, CPF, ID');
  }
  
  return users;
}

