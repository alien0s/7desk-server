import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'

const router = Router()

router.get('/db/health', async (_req, res) => {
  const { rows } = await query('select now() as now')
  res.json({ ok: true, now: rows[0].now })
})

// cria admin/agent/cliente + 1 ticket (idempotente)
router.post('/db/seed', async (_req, res) => {
  async function ensureUser(name, email, role) {
    const { rows } = await query('select id from users where email=$1', [email])
    if (rows.length) return rows[0]
    const hash = await bcrypt.hash('123456', 10)
    const ins = await query(
      `insert into users (name,email,password_hash,role) values ($1,$2,$3,$4) returning id`,
      [name, email, hash, role]
    )
    return ins.rows[0]
  }

  const admin = await ensureUser('Admin',   'admin@helpdesk.io',  'ADMIN')
  const agent = await ensureUser('Agente',  'agent@helpdesk.io',  'AGENTE')
  const cli   = await ensureUser('Cliente', 'client@helpdesk.io', 'CLIENTE')

  const { rows: t } = await query('select id from tickets limit 1')
  if (!t.length) {
    const { rows: tk } = await query(
      `insert into tickets (title, description, priority, requester_id, assignee_id)
       values ('Erro ao logar','Recebo 500 ao tentar autenticar.','ALTA',$1,$2) returning id`,
      [cli.id, agent.id]
    )
    await query(
      `insert into comments (ticket_id, author_id, body) values ($1,$2,$3), ($1,$4,$5)`,
      [tk[0].id, agent.id, 'Pode enviar navegador e horário?', cli.id, 'Chrome, 10:20.']
    )
  }

  res.json({ ok: true })
})

export default router
