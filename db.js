// server/db.js  (ESM)
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL não definido no .env')
  process.exit(1)
}

// Pool principal (nome padrão "db")
export const db = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Neon/Render
})

// Helper opcional (quem preferir importar só "query")
export async function query(sql, params = []) {
  return db.query(sql, params)
}

// Compatibilidade: se algum arquivo antigo ainda usa "pool"
export { db as pool }
