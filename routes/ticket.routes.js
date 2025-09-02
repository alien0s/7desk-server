
// server/routes/ticket.routes.js
import { Router } from 'express'
import { asInt, requireAuth } from '../middleware/auth.js'
import {
  createTicket, findTicketById, listTickets, updateTicket, deleteTicket,
  addComment, listCommentsRaw
} from '../tickets.store.js'
import { findUserById } from '../users.store.js'
import { db, query } from '../db.js'

const router = Router()

// ------------------ SSE infra (global + por ticket) ------------------
const userStreams   = new Map() // userId -> Set(res)
const ticketStreams = new Map() // ticketId -> Set(res)

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.write('\n')
}
function sseSend(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}
function addStream(map, key, res) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(res)
}
function removeStream(map, key, res) {
  const set = map.get(key)
  if (!set) return
  set.delete(res)
  if (!set.size) map.delete(key)
}
function broadcastTicket(ticketId, event, payload) {
  const set = ticketStreams.get(Number(ticketId))
  if (!set) return
  for (const res of set) sseSend(res, event, payload)
}
function broadcastToUsers(userIds, event, payload, excludeUserId = null) {
  for (const uid of userIds) {
    if (excludeUserId != null && Number(uid) === Number(excludeUserId)) continue
    const set = userStreams.get(Number(uid))
    if (!set) continue
    for (const res of set) sseSend(res, event, payload)
  }
}

// eventos globais do usuário
router.get('/events', requireAuth, (req, res) => {
  sseHeaders(res)
  addStream(userStreams, req.user.id, res)
  req.on('close', () => removeStream(userStreams, req.user.id, res))
})

// stream por ticket (comentários/typing)
router.get('/tickets/:id/stream', requireAuth, (req, res) => {
  const ticketId = Number(req.params.id)
  sseHeaders(res)
  addStream(ticketStreams, ticketId, res)
  req.on('close', () => removeStream(ticketStreams, ticketId, res))
})

// typing ping
router.post('/tickets/:id/typing', requireAuth, async (req, res) => {
  const ticketId = Number(req.params.id)
  const { typing = true } = req.body || {}

  // pega nome/avatar do usuário
  const u = await findUserById(req.user.id)
  broadcastTicket(ticketId, 'typing', {
    ticketId,
    typing: !!typing,
    userId: u?.id,
    name: u?.name,
    avatarUrl: u?.avatar_url || null,
    at: Date.now(),
  })
  res.json({ ok: true })
})

// ------------------ Rotas REST ------------------

// GET /tickets
router.get('/tickets', requireAuth, async (req, res) => {
  const { status, priority, assigneeId, associacao, search, page = '1', pageSize = '20' } = req.query || {}
  const r = await listTickets({
    role: req.user.role,
    userId: req.user.id,
    status, priority, assigneeId, associacao, search,
    page: Number(page), pageSize: Number(pageSize),
  })
  res.json(r)
})

// POST /tickets
router.post('/tickets', requireAuth, async (req, res) => {
  const { title, description, priority = 'MÉDIA', assigneeId, associacao } = req.body || {}
  if (!title || !description) return res.status(400).json({ error: 'title e description obrigatórios' })

  const t = await createTicket({
    title: String(title),
    description: String(description),
    priority: String(priority).toUpperCase(),
    requesterId: req.user.id,
    assigneeId: assigneeId ? Number(assigneeId) : null,
    associacao: associacao ? String(associacao) : null,
  })

  res.status(201).json(t)
})

// GET /tickets/:id
router.get('/tickets/:id', requireAuth, async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })
  const t = await findTicketById(id)
  if (!t) return res.status(404).json({ error: 'Not found' })

  // regra: requester só vê o próprio
  if (req.user.role === 'REQUESTER' && t.requesterId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // requester e assignee com avatar para a lateral
  const [reqUser, asgUser] = await Promise.all([
    findUserById(t.requesterId),
    t.assigneeId ? findUserById(t.assigneeId) : Promise.resolve(null)
  ])

  // comentários com autor + avatar
  const raw = await listCommentsRaw(id)
  const comments = await Promise.all(raw.map(async (c) => {
    const u = await findUserById(c.authorId)
    return { ...c, author: u ? { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url } : null }
  }))

  res.json({
    ...t,
    requester: reqUser ? { id: reqUser.id, name: reqUser.name, email: reqUser.email, avatar_url: reqUser.avatar_url } : null,
    assignee:  asgUser ? { id: asgUser.id, name: asgUser.name, email: asgUser.email, avatar_url: asgUser.avatar_url } : null,
    comments,
  })
})

// PATCH /tickets/:id
router.patch('/tickets/:id', requireAuth, async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })
  const t = await findTicketById(id)
  if (!t) return res.status(404).json({ error: 'Not found' })

  // requester: só título/descrição do próprio
  if (req.user.role === 'REQUESTER') {
    if (t.requesterId !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const { title, description } = req.body || {}
    if (!title && !description) return res.status(400).json({ error: 'Nada para atualizar' })
    const updated = await updateTicket(id, {
      ...(title ? { title: String(title) } : {}),
      ...(description ? { description: String(description) } : {}),
    })
    return res.json(updated)
  }

  // agent/admin: pode editar permitido
  const body = req.body || {}
  const allowed = {}
  if (body.title)       allowed.title = String(body.title)
  if (body.description) allowed.description = String(body.description)
  if (body.status)      allowed.status = String(body.status).toUpperCase()
  if (body.priority)    allowed.priority = String(body.priority).toUpperCase()
  if (body.associacao !== undefined) allowed.associacao = body.associacao === null ? null : String(body.associacao)
  if (body.assigneeId !== undefined)  allowed.assigneeId  = body.assigneeId  === null ? null : Number(body.assigneeId)

  const updated = await updateTicket(id, allowed)
  res.json(updated)
})

// DELETE /tickets/:id  (apenas ADMIN — valide no middleware se quiser)
router.delete('/tickets/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' })
  const ok = await deleteTicket(Number(req.params.id))
  if (!ok) return res.status(404).json({ error: 'Not found' })
  res.status(204).send()
})

// GET /tickets/:id/comments
router.get('/tickets/:id/comments', requireAuth, async (req, res) => {
  const id = asInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid id' })
  const tk = await db.query('SELECT id, requester_id FROM tickets WHERE id=$1', [id])
  if (!tk.rows[0]) return res.status(404).json({ error: 'Not found' })

  // regra de permissão (se tiver)
  if (req.user.role === 'REQUESTER' && tk.rows[0].requester_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { rows } = await db.query(
    'SELECT id, ticket_id, author_id, body, created_at FROM comments WHERE ticket_id=$1 ORDER BY created_at ASC',
    [id]
  )

  const withAuthors = await Promise.all(rows.map(async (c) => {
    const u = await findUserById(c.author_id)
    return {
      id: c.id,
      ticketId: c.ticket_id,
      body: c.body,
      createdAt: c.created_at,
      author: u ? { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url } : null
    }
  }))

  res.json(withAuthors)
})


router.post('/tickets/:id/comments', requireAuth, async (req, res) => {
  const id = asInt(req.params.id)
  const body = String(req.body?.body || '').trim()
  if (!id) return res.status(400).json({ error: 'invalid id' })
  if (!body) return res.status(400).json({ error: 'body required' })

  // garante que o ticket existe e pega participantes
  const tk = await db.query(
    'select id, requester_id, assignee_id from tickets where id=$1',
    [id]
  )
  if (!tk.rows[0]) return res.status(404).json({ error: 'Not found' })

  const r = await db.query(
    `insert into comments (ticket_id, author_id, body)
     values ($1,$2,$3)
     returning id, ticket_id as "ticketId", author_id as "authorId", body, created_at as "createdAt"`,
    [id, req.user.id, body]
  )
  const comment = r.rows[0]

  // carrega autor pra exibir no front
  const u = await query(`select id, name, email, avatar_url from users where id=$1`, [req.user.id])
  comment.author = u.rows[0] || { id: req.user.id }

  // 🔴 EMITE para quem está com o stream do ticket aberto (tempo real na conversa)
  broadcastTicket(id, 'comment', comment)

  // força limpar o indicador de digitação de quem acabou de enviar
  broadcastTicket(id, 'typing', {
    ticketId: id,
    typing: false,
    userId: req.user.id,
    name: comment.author?.name,
    avatarUrl: comment.author?.avatar_url || null,
    at: Date.now(),
  })

  // 🟠 EMITE um evento global p/ participantes (para badge/ordenar na lista)
  const participants = [tk.rows[0].requester_id, tk.rows[0].assignee_id].filter(Boolean)
  broadcastToUsers(participants, 'comment', { ticketId: id, comment }, req.user.id)

  res.status(201).json(comment)
})



export default router
