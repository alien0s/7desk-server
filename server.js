// server/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

import authRoutes from './routes/auth.routes.js'
import ticketRoutes from './routes/ticket.routes.js'
import userRoutes from './routes/user.routes.js'

const app = express()

// 🔐 CORS — permita só o seu front (e localhost em dev)
const ALLOWED_ORIGINS = [
  process.env.FRONT_ORIGIN,            // ex: https://meu-front.vercel.app
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean)

app.use(cors({
  origin(origin, cb) {
    // Sem origem (Postman/cURL) → permite
    if (!origin) return cb(null, true)
    const ok = ALLOWED_ORIGINS.some(o =>
      origin === o ||
      // opcional: qualquer subdomínio *.vercel.app, se você usa previews
      (o === '*.vercel.app' && origin.endsWith('.vercel.app'))
    )
    cb(ok ? null : new Error('Not allowed by CORS'), ok)
  },
  credentials: true, // só precisa se for usar cookies; com Bearer não faz mal
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization','Content-Type'],
  optionsSuccessStatus: 200,
}))
app.options('*', cors()) // garante resposta ao preflight

app.use(express.json())

// 🔽 /uploads estáticos
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, 'uploads')
console.log('Serving /uploads from:', uploadsDir)

app.use('/uploads', express.static(uploadsDir, { maxAge: '0', immutable: false }))

app.get('/', (_req, res) => res.json({ ok: true, service: 'helpdesk-api' }))

app.use('/auth', authRoutes)
app.use('/', userRoutes)
app.use('/', ticketRoutes)

const port = Number(process.env.PORT || 4000)
app.listen(port, () => console.log(`API http://localhost:${port}`))
