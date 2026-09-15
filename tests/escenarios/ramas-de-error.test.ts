import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import {
  ID_INEXISTENTE,
  autenticar,
  autenticarAdmin,
  celular,
  errorRegistroNoEncontrado,
  usuarioConConteo,
} from '../helpers/fixtures'

/**
 * Ramas que los caminos felices no recorren: fallos de infraestructura,
 * cambio de rol, y el desglose por estado del panel.
 *
 * Los errores inesperados se registran en consola a propósito (error.middleware
 * loggea antes de responder), así que se silencia la salida para que el
 * reporte de la suite quede limpio.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

function silenciarConsola() {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('Cambio de rol — PUT /admin/users/:id/role', () => {
  const RUTA = (id: string) => `/api/v1/admin/users/${id}/role`

  it('rol USER → 403', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .put(RUTA(ID_INEXISTENTE))
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' })

    expect(res.status).toBe(403)
  })

  it('rol inválido → 400 Datos inválidos', async () => {
    const { token } = autenticarAdmin()

    const res = await request(app)
      .put(RUTA(ID_INEXISTENTE))
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'SUPERADMIN' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
  })

  it('un admin no puede cambiar su propio rol → 400', async () => {
    const { user, token } = autenticarAdmin()

    const res = await request(app)
      .put(RUTA(user.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'USER' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('No puedes cambiar tu propio rol')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('cambia el rol de otro usuario → 200', async () => {
    const { token } = autenticarAdmin()
    const otro = usuarioConConteo({ role: 'USER' })
    prismaMock.user.update.mockResolvedValue({ ...otro, role: 'ADMIN' })

    const res = await request(app)
      .put(RUTA(otro.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' })

    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe('ADMIN')
  })

  it('el id no existe → 404', async () => {
    const { token } = autenticarAdmin()
    prismaMock.user.update.mockRejectedValue(errorRegistroNoEncontrado())

    const res = await request(app)
      .put(RUTA(ID_INEXISTENTE))
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' })

    expect(res.status).toBe(404)
  })
})

describe('Fallos inesperados de la capa de datos', () => {
  it('un error de base de datos sale como 500, sin filtrar la consulta', async () => {
    silenciarConsola()
    const { token } = autenticarAdmin()
    prismaMock.user.count.mockRejectedValue(
      new Error('connection refused: 127.0.0.1:5432'),
    )

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error interno del servidor')
  })

  it('si la base falla al releer el usuario del token, responde 500 y no 401', async () => {
    silenciarConsola()
    const { token } = autenticar()
    // El middleware consulta la fila vigente en cada request; si esa consulta
    // se cae, es un fallo del servidor, no un token inválido.
    prismaMock.user.findUnique.mockRejectedValue(new Error('socket hang up'))

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })

  it('un update que falla por otra razón distinta de P2025 no se convierte en 404', async () => {
    silenciarConsola()
    const { token } = autenticarAdmin()
    prismaMock.user.update.mockRejectedValue(new Error('deadlock detected'))

    const res = await request(app)
      .put(`/api/v1/admin/users/${ID_INEXISTENTE}/ban`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'motivo de prueba' })

    expect(res.status).toBe(500)
  })
})

describe('Actualización de celular con relaciones', () => {
  it('reemplaza imágenes, colores y características cuando vienen en el body', async () => {
    const { token } = autenticarAdmin()
    const existente = celular()
    prismaMock.phone.findUnique.mockResolvedValue(existente)
    prismaMock.phone.update.mockResolvedValue(existente)

    const res = await request(app)
      .put(`/api/v1/phones/${existente.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        images: [{ url: 'https://ejemplo.com/foto.jpg', position: 0 }],
        colors: [{ colorId: 'c1', name: 'Negro', hex: '#000000' }],
        features: ['Face ID'],
      })

    // Las tres relaciones se borran y se vuelven a crear en la misma escritura.
    expect(res.status).toBe(200)
    const dataEnviada = prismaMock.phone.update.mock.calls[0][0].data
    expect(dataEnviada.images).toMatchObject({ deleteMany: {} })
    expect(dataEnviada.colors).toMatchObject({ deleteMany: {} })
    expect(dataEnviada.features).toMatchObject({ deleteMany: {} })
  })

  it('sin relaciones en el body, no las toca', async () => {
    const { token } = autenticarAdmin()
    const existente = celular()
    prismaMock.phone.findUnique.mockResolvedValue(existente)
    prismaMock.phone.update.mockResolvedValue(existente)

    await request(app)
      .put(`/api/v1/phones/${existente.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 999_000 })

    const dataEnviada = prismaMock.phone.update.mock.calls[0][0].data
    expect(dataEnviada).not.toHaveProperty('images')
    expect(dataEnviada).not.toHaveProperty('colors')
    expect(dataEnviada).not.toHaveProperty('features')
  })
})

describe('Panel — pedidos recientes', () => {
  it('mapea los pedidos recientes con su número de artículos', async () => {
    const { token } = autenticarAdmin()
    prismaMock.user.count.mockResolvedValue(0)
    prismaMock.phone.count.mockResolvedValue(0)
    prismaMock.order.groupBy.mockResolvedValue([])
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: 0 } })
    prismaMock.order.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        orderRef: 'CP-ABC123',
        email: 'ana@test.com',
        name: 'Ana Garcia',
        total: 120_000,
        status: 'CONFIRMED',
        createdAt: new Date(),
        _count: { items: 3 },
      },
    ])
    prismaMock.order.findMany.mockResolvedValueOnce([])

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.recentOrders[0]).toMatchObject({
      orderRef: 'CP-ABC123',
      itemCount: 3,
    })
  })
})
