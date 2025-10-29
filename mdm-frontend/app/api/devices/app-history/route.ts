import { NextRequest, NextResponse } from 'next/server';

// Função para buscar dados do banco diretamente
async function getAppHistory(deviceId: string, type: string, limit: number, offset: number, days: number) {
    const { Pool } = require('pg');
    
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'mdmweb',
        password: process.env.DB_PASSWORD || '2486', // ✅ CORREÇÃO: Senha padrão
        port: parseInt(process.env.DB_PORT) || 5432,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });

    try {
        let query, params;
        
        if (type === 'history') {
            query = `
                SELECT 
                    package_name,
                    app_name,
                    access_date,
                    first_access_time,
                    last_access_time,
                    access_count,
                    total_duration_ms,
                    is_allowed,
                    created_at,
                    updated_at
                FROM app_access_history 
                WHERE device_id = $1
                ORDER BY access_date DESC, last_access_time DESC
                LIMIT $2 OFFSET $3
            `;
            params = [deviceId, limit, offset];
        } else if (type === 'top') {
            query = `
                SELECT 
                    package_name,
                    app_name,
                    SUM(access_count) as total_accesses,
                    SUM(total_duration_ms) as total_duration_ms,
                    MAX(last_access_time) as last_access_time,
                    COUNT(DISTINCT access_date) as days_used
                FROM app_access_history 
                WHERE device_id = $1 
                AND access_date >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY package_name, app_name
                ORDER BY total_accesses DESC, last_access_time DESC
                LIMIT 50
            `;
            params = [deviceId];
        } else if (type === 'daily') {
            // ✅ CORREÇÃO: Buscar dados dos últimos 7 dias (mais simples)
            query = `
                SELECT 
                    access_date,
                    package_name,
                    app_name,
                    access_count,
                    total_duration_ms,
                    last_access_time
                FROM app_access_history
                WHERE device_id = $1
                AND access_date >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY access_date ASC, last_access_time ASC
            `;
            params = [deviceId];
            
            console.log('📊 Query SQL para daily:', query);
            console.log('📊 Parâmetros:', params);
        } else {
            throw new Error('Tipo inválido');
        }

        const result = await pool.query(query, params);
        await pool.end();
        
        return result.rows;
    } catch (error) {
        await pool.end();
        throw error;
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const type = searchParams.get('type') || 'history';
        const limit = parseInt(searchParams.get('limit') || '100');
        const offset = parseInt(searchParams.get('offset') || '0');
        const days = parseInt(searchParams.get('days') || '30');

        if (!deviceId) {
            return NextResponse.json(
                { error: 'deviceId é obrigatório' },
                { status: 400 }
            );
        }

        // Buscar dados reais do banco
        const data = await getAppHistory(deviceId, type, limit, offset, days);

        console.log(`📊 API app-history: deviceId=${deviceId}, type=${type}, registros=${data.length}`);
        console.log(`📊 Dados retornados:`, data);

        return NextResponse.json({
            success: true,
            data: data,
            type: type,
            deviceId: deviceId
        });

    } catch (error) {
        console.error('❌ Erro na API de histórico de apps:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');

        if (!deviceId) {
            return NextResponse.json(
                { error: 'deviceId é obrigatório' },
                { status: 400 }
            );
        }

        console.log(`🧹 Limpando histórico de apps do dispositivo: ${deviceId}`);
        
        const { Pool } = require('pg');
        
        const pool = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'mdmweb',
            password: process.env.DB_PASSWORD || '2486',
            port: parseInt(process.env.DB_PORT) || 5432,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        });

        try {
            const query = 'DELETE FROM app_access_history WHERE device_id = $1';
            const result = await pool.query(query, [deviceId]);
            await pool.end();
            
            console.log(`✅ Histórico limpo: ${result.rowCount} registros removidos`);
            
            return NextResponse.json({
                success: true,
                deletedCount: result.rowCount,
                message: `${result.rowCount} registros removidos com sucesso`
            });
        } catch (error) {
            await pool.end();
            throw error;
        }

    } catch (error) {
        console.error('❌ Erro na limpeza de histórico:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
