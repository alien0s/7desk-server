import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import fs from 'fs/promises'
import fssync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { db, query } from '../db.js'
import { asInt, requireAuth, requireRole } from '../middleware/auth.js'
import bcrypt from 'bcryptjs' 

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

// 🔽 pastas: .../server/routes -> sobe p/ .../server -> /uploads/avatars
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads')
const AVATAR_DIR  = path.join(UPLOAD_ROOT, 'avatars')

// cria as pastas se ainda não existem
if (!fssync.existsSync(AVATAR_DIR)) {
  await fs.mkdir(AVATAR_DIR, { recursive: true })
  console.log('Created avatars dir:', AVATAR_DIR)
}

// garante pastas (top-level await é ok em Node 18.17+/20+)
await fs.mkdir(AVATAR_DIR, { recursive: true })



// ------------------------------------------------------------------------------------
// POST /users/me/avatar  (autenticado)
router.post('/users/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório' })
    const userId = req.user.id
    const ts = Date.now()

    const filename = `u${userId}-${ts}.webp`
    const filepath = path.join(AVATAR_DIR, filename)
    const relUrl   = `/uploads/avatars/${filename}`

    await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 82 })
      .toFile(filepath)

    // salva URL relativa no banco
    await db.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [relUrl, userId])

    // responde com URL absoluta + cache-buster
    const base = `${req.protocol}://${req.get('host')}`
    const absoluteUrl = `${base}${relUrl}?v=${ts}`

    console.log('Avatar salvo em:', filepath, '→', absoluteUrl)
    res.json({ avatar_url: absoluteUrl })
  } catch (e) {
    console.error('avatar upload error:', e)
    res.status(500).json({ error: 'Falha ao processar imagem' })
  }
})

// LISTAR USUÁRIOS (ADMIN)
router.get('/users', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const search = String(req.query.search || '').trim()
  const sql = `
    select id, name, email, role, avatar_url
    from users
    where ($1 = '' or name ilike '%'||$1||'%' or email ilike '%'||$1||'%')
    order by id desc
    limit 200
  `
  const r = await query(sql, [search])
  res.json({ items: r.rows, total: r.rowCount })
})

// CRIAR USUÁRIO (ADMIN)
router.post('/users', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { name, email, role = 'CLIENTE', password } = req.body || {}
  if (!name || !email) return res.status(400).json({ error: 'name and email required' })

  // gera senha se não vier
  const plain = password ? String(password) : Math.random().toString().slice(2, 9) // 7 dígitos
  const hash  = await bcrypt.hash(plain, 10)

  const r = await query(
    `insert into users (name, email, password_hash, role)
     values ($1,$2,$3,$4)
     returning id, name, email, role, avatar_url`,
    [String(name), String(email).toLowerCase(), hash, String(role).toUpperCase()]
  )

  // se você quiser ver a senha gerada no front, devolva-a em generatedPassword
  res.status(201).json({ user: r.rows[0], generatedPassword: password ? null : plain })
})

// GET /users/:id  (ADMIN) — detalhes do usuário
router.get('/users/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })

  const r = await query(
    `select id, name, email, role, avatar_url
       from users where id=$1`,
    [id]
  )
  if (!r.rowCount) return res.status(404).json({ error: 'Not found' })
  res.json(r.rows[0])
})

// POST /users/:id/reset-password  (ADMIN) — gera nova senha 7 dígitos e retorna APENAS AGORA
router.post('/users/:id/reset-password', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })

  const temp = Math.floor(1000000 + Math.random() * 9000000).toString()
  const hash = await bcrypt.hash(temp, 10)

  const r = await query(
    `update users set password_hash=$1 where id=$2 returning id`,
    [hash, id]
  )
  if (!r.rowCount) return res.status(404).json({ error: 'Not found' })

  res.json({ temporaryPassword: temp })
})

// REMOVER USUÁRIO (ADMIN) – opcional, se seu front usa o ícone de lixeira
router.delete('/users/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })
  await query('delete from users where id=$1', [id])
  res.status(204).send()
})

router.patch('/users/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })

  const { role, name, email } = req.body || {}
  const fields = []
  const vals = []
  let i = 1

  if (role)  { fields.push(`role=$${i++}`);  vals.push(String(role).toUpperCase()) }
  if (name)  { fields.push(`name=$${i++}`);  vals.push(String(name)) }
  if (email) { fields.push(`email=$${i++}`); vals.push(String(email).toLowerCase()) }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' })

  vals.push(id)
  const sql = `update users set ${fields.join(', ')} where id=$${i} returning id,name,email,role,avatar_url`
  const r = await query(sql, vals)
  res.json(r.rows[0])
})

export default router
