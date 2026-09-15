import cors from 'cors'
import express from 'express'
import { errorHandler } from './interface/middlewares/error.middleware'
import routes from './interface/routes'

const app = express()

// Oculta la cabecera "X-Powered-By: Express": deja de anunciar el framework
// y su versión a cualquiera que mire las respuestas.
app.disable('x-powered-by')

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  }),
)
app.use(express.json())

// Verificación rápida de que el servidor está activo
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/v1', routes)

// 404 — ruta no encontrada
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

// Manejador global de errores (siempre al final)
app.use(errorHandler)

export default app
