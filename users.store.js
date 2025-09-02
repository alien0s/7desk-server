// server/users.store.js
import bcrypt from 'bcryptjs'
import { db } from './db.js'

export async function findUserById(id) {
  const { rows } = await db.query(
    'SELECT id, name, email, role, avatar_url FROM users WHERE id=$1 LIMIT 1',
    [id]
  )
  return rows[0] || null
}

export async function findUserByEmail(email) {
  const { rows } = await db.query(
    'SELECT id, name, email, role, avatar_url, password_hash FROM users WHERE email=$1 LIMIT 1',
    [email]
  )
  return rows[0] || null
}

export async function listUsers({ search = '' } = {}) {
  const q = `%${(search || '').trim()}%`
  const { rows } = await db.query(
    `SELECT id, name, email, role, avatar_url
       FROM users
      WHERE ($1 = '%%' OR name ILIKE $1 OR email ILIKE $1)
      ORDER BY id ASC`,
    [q]
  )
  return rows
}

export async function createUser({ name, email, password, role = 'REQUESTER' }) {
  const hash = await bcrypt.hash(String(password), 10)
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1,$2,$3,$4)
     RETURNING id, name, email, role, avatar_url, created_at`,
    [name, email, hash, role]
  )
  return rows[0]
}

export async function deleteUser(id) {
  const { rowCount } = await db.query('DELETE FROM users WHERE id=$1', [id])
  return rowCount > 0
}
