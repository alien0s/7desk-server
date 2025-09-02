// server/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

import authRoutes from './routes/auth.routes.js'
import ticketRoutes from './routes/ticket.routes.js'
import userRoutes from './routes/user.routes.js'
// import dbRoutes ... (se tiver)

const app = express()
app.use(cors())
app.use(express.json())

// 🔽 resolva o caminho absoluto de /uploads a partir deste arquivo
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, 'uploads')

// LOG de debug (aparece no terminal ao subir o server)
console.log('Serving /uploads from:', uploadsDir)

app.use('/uploads', express.static(uploadsDir, {
  maxAge: '0',      // não cachear em dev
  immutable: false,
}))

app.get('/', (_req, res) => res.json({ ok: true, service: 'helpdesk-api' }))

app.use('/auth', authRoutes)
app.use('/', userRoutes)
app.use('/', ticketRoutes)
// app.use('/', dbRoutes)

const port = Number(process.env.PORT || 4000)
app.listen(port, () => console.log(`API http://localhost:${port}`))
