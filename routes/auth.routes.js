import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

function asInt(v) {
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  const r = await query(
    `select id, name, email, role, password_hash, avatar_url
       from users where lower(email)=lower($1) limit 1`,
    [String(email)]
  )
  if (!r.rowCount) return res.status(401).json({ error: 'Invalid credentials' })

  const u = r.rows[0]
  const ok = await bcrypt.compare(String(password), u.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' })
  const user = { id: u.id, name: u.name, email: u.email, role: u.role, avatar_url: u.avatar_url || null }
  res.json({ token, user })
})

// GET /auth/me  (blindado)
router.get('/me', requireAuth, async (req, res) => {
  const id = asInt(req.user?.id)
  if (!id) return res.status(401).json({ error: 'Unauthorized' })

  const r = await query(
    `select id, name, email, role, avatar_url
       from users where id = $1`,
    [id]
  )
  if (!r.rowCount) return res.status(401).json({ error: 'Unauthorized' })
  res.json(r.rows[0])
})

export default router
