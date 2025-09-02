// server/tickets.store.js
import { db } from './db.js'

function camelTicket(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,        // 'ABERTO' | 'PENDENTE' | 'RESOLVIDO' | 'FECHADO'
    priority: r.priority,    // 'BAIXA' | 'MÉDIA' | 'ALTA'
    requesterId: r.requester_id,
    assigneeId: r.assignee_id,
    associacao: r.associacao,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function createTicket({ title, description, priority = 'MÉDIA', requesterId, assigneeId = null, associacao = null }) {
  const { rows } = await db.query(
    `INSERT INTO tickets (title, description, priority, requester_id, assignee_id, associacao)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [title, description, priority, requesterId, assigneeId, associacao]
  )
  return camelTicket(rows[0])
}

export async function findTicketById(id) {
  const { rows } = await db.query('SELECT * FROM tickets WHERE id=$1 LIMIT 1', [id])
  return rows[0] ? camelTicket(rows[0]) : null
}

export async function listTickets({
  role, userId, search = '', status, priority, assigneeId, associacao, page = 1, pageSize = 20
}) {
  const where = []
  const params = []
  let p = 1

  if (role === 'REQUESTER') {
    where.push(`requester_id = $${p++}`)
    params.push(userId)
  }

  if (search) {
    where.push(`(title ILIKE $${p} OR description ILIKE $${p})`)
    params.push(`%${search}%`); p++
  }
  if (status)    { where.push(`status = $${p++}`);    params.push(status.toUpperCase()) }
  if (priority)  { where.push(`priority = $${p++}`);  params.push(priority.toUpperCase()) }
  if (assigneeId !== undefined && assigneeId !== null && assigneeId !== '') {
    where.push(`assignee_id = $${p++}`); params.push(Number(assigneeId))
  }
  if (associacao) { where.push(`associacao ILIKE $${p++}`); params.push(`%${associacao}%`) }

  const wh = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Number(pageSize) || 20
  const offset = ((Number(page) || 1) - 1) * limit

  const totalSql = `SELECT COUNT(*)::int AS n FROM tickets ${wh}`
  const listSql  = `SELECT * FROM tickets ${wh} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`

  const [{ rows: totalRows }, { rows: listRows }] = await Promise.all([
    db.query(totalSql, params),
    db.query(listSql, params),
  ])

  return {
    total: totalRows[0]?.n || 0,
    items: listRows.map(camelTicket),
  }
}

export async function updateTicket(id, patch = {}) {
  const fields = []
  const values = []
  let p = 1

  if (patch.title != null)        { fields.push(`title=$${p++}`);        values.push(String(patch.title)) }
  if (patch.description != null)  { fields.push(`description=$${p++}`);  values.push(String(patch.description)) }
  if (patch.status != null)       { fields.push(`status=$${p++}`);       values.push(String(patch.status).toUpperCase()) }
  if (patch.priority != null)     { fields.push(`priority=$${p++}`);     values.push(String(patch.priority).toUpperCase()) }
  if ('assigneeId' in patch)      { fields.push(`assignee_id=$${p++}`);  values.push(patch.assigneeId == null ? null : Number(patch.assigneeId)) }
  if ('associacao' in patch)      { fields.push(`associacao=$${p++}`);   values.push(patch.associacao == null ? null : String(patch.associacao)) }

  if (fields.length === 0) return findTicketById(id)

  const sql = `UPDATE tickets SET ${fields.join(', ')} WHERE id=$${p} RETURNING *`
  values.push(Number(id))
  const { rows } = await db.query(sql, values)
  return rows[0] ? camelTicket(rows[0]) : null
}

export async function deleteTicket(id) {
  const { rowCount } = await db.query('DELETE FROM tickets WHERE id=$1', [id])
  return rowCount > 0
}

// ---- Comments ----

function camelComment(r) {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    authorId: r.author_id,
    body: r.body,
    createdAt: r.created_at,
  }
}

export async function addComment({ ticketId, authorId, body }) {
  const { rows } = await db.query(
    `INSERT INTO comments (ticket_id, author_id, body)
     VALUES ($1,$2,$3)
     RETURNING id, ticket_id, author_id, body, created_at`,
    [ticketId, authorId, body]
  )
  return camelComment(rows[0])
}

export async function listCommentsRaw(ticketId) {
  const { rows } = await db.query(
    `SELECT id, ticket_id, author_id, body, created_at
       FROM comments
      WHERE ticket_id=$1
      ORDER BY created_at ASC`,
    [ticketId]
  )
  return rows.map(camelComment)
}
