// server/middleware/auth.js
import jwt from 'jsonwebtoken'
import { query } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Converte para inteiro seguro. Retorna null se não for inteiro.
export function asInt(v) {
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

// Busca segura por ID (não consulta se id inválido)
export async function findUserById(id) {
  const n = asInt(id)
  if (!n) return null
  const { rows } = await query(
    'select id, name, email, role, avatar_url from users where id=$1 limit 1',
    [n]
  )
  return rows[0] || null
}

// Lê o token, valida e injeta req.user SEMPRE com id numérico válido
export function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : String(req.query.token || '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const data = jwt.verify(token, JWT_SECRET)
    const id = asInt(data?.id)
    if (!id) return res.status(401).json({ error: 'Unauthorized' })

    req.user = {
      id,
      role: String(data?.role || '').toUpperCase(),
      name: data?.name || ''
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

// Restringe por papel
export function requireRole(roles = []) {
  const want = (Array.isArray(roles) ? roles : [roles])
    .map((r) => String(r).toUpperCase())
  return (req, res, next) => {
    const r = String(req.user?.role || '').toUpperCase()
    if (!want.includes(r)) return res.status(403).json({ error: 'Forbidden' })
    next()
  }
}
