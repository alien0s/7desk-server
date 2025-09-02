// Gerencia conexões SSE globais e por-ticket
const globalByUser = new Map()    // userId -> Set(res)
const ticketById   = new Map()    // ticketId -> Map(userId -> Set(res))

function addGlobal(userId, res) {
  const id = String(userId)
  if (!globalByUser.has(id)) globalByUser.set(id, new Set())
  globalByUser.get(id).add(res)
  res.on('close', () => {
    globalByUser.get(id)?.delete(res)
    if (globalByUser.get(id)?.size === 0) globalByUser.delete(id)
  })
}

function addTicket(ticketId, userId, res) {
  const tid = String(ticketId), uid = String(userId)
  if (!ticketById.has(tid)) ticketById.set(tid, new Map())
  const m = ticketById.get(tid)
  if (!m.has(uid)) m.set(uid, new Set())
  m.get(uid).add(res)

  res.on('close', () => {
    m.get(uid)?.delete(res)
    if (m.get(uid)?.size === 0) m.delete(uid)
    if (m.size === 0) ticketById.delete(tid)
  })
}

export function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  res.write(':\n\n') // ping
}

export function subscribeGlobal(userId, res) {
  addGlobal(userId, res)
}

export function subscribeTicket(ticketId, userId, res) {
  addTicket(ticketId, userId, res)
}

function send(resSet, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  resSet.forEach(r => { try { r.write(payload) } catch {} })
}

export function publishToUsers(userIds = [], event, data) {
  const unique = new Set(userIds.map(String))
  unique.forEach(uid => {
    const set = globalByUser.get(uid)
    if (set && set.size) send(set, event, data)
  })
}

export function publishToTicket(ticketId, event, data, { excludeUserId } = {}) {
  const tid = String(ticketId)
  const map = ticketById.get(tid)
  if (!map) return
  for (const [uid, set] of map.entries()) {
    if (excludeUserId != null && String(excludeUserId) === uid) continue
    if (set.size) send(set, event, data)
  }
}
