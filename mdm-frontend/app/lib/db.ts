import { Pool } from 'pg'

// Pool singleton para evitar "too many clients" do PostgreSQL
// Next.js pode recriar módulos em dev mode, então usamos globalThis
const globalForPg = globalThis as unknown as { pgPool: Pool | undefined }

export const pool = globalForPg.pgPool ?? new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mdmweb',
  password: process.env.DB_PASSWORD || '2486',
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10, // máximo de conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool
}
