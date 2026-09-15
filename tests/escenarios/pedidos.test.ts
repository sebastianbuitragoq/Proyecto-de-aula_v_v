import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import { autenticar, autenticarAdmin } from '../helpers/fixtures'

/**
 * Endpoints de pedidos
 * POST /orders · GET /orders/my · GET /orders · PUT /orders/:id/status
 *
 * Cubren el controlador de pedidos, que hasta ahora solo se ejercía desde
 * los casos de uso.
 */

const RUTA = '/api/v1/orders'
const PHONE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const ORDER_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function bodyPedido() {
  return {
    email: 'ana@test.com',
    name: 'Ana Garcia',
    phone: '+57 300 123 4567',
    address: 'Calle 123 #45-67',
    city: 'Bogota',
    dept: 'Cundinamarca',
    items: [{ phoneId: PHONE_ID, qty: 1 }],
  }
}

function pedido(cambios: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderRef: 'CP-ABC123',
    userId: null,
    email: 'ana@test.com',
    name: 'Ana Garcia',
    phone: '+57 300 123 4567',
    address: 'Calle 123 #45-67',
    city: 'Bogota',
    dept: 'Cundinamarca',
    subtotal: 100_000,
    shipping: 20_000,
    total: 120_000,
    status: 'CONFIRMED',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    ...cambios,
  }
}

describe('POST /orders — crear pedido', () => {
  it('sin token → 401', async () => {
    const res = await request(app).post(RUTA).send(bodyPedido())

    expect(res.status).toBe(401)
  })

  it('body inválido → 400 Datos inválidos', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .post(RUTA)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...bodyPedido(), items: [] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
  })

  it('celular inexistente → 404', async () => {
    const { token } = autenticar()
    prismaMock.phone.findMany.mockResolvedValue([])

    const res = await request(app)
      .post(RUTA)
      .set('Authorization', `Bearer ${token}`)
      .send(bodyPedido())

    expect(res.status).toBe(404)
  })

  it('datos correctos → 201 con el pedido creado', async () => {
    const { token } = autenticar()
    prismaMock.phone.findMany.mockResolvedValue([
      {
        id: PHONE_ID,
        name: 'Celular',
        price: 100_000,
        heroImage: null,
        stock: 5,
      },
    ])
    prismaMock.phone.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.order.create.mockResolvedValue(pedido())

    const res = await request(app)
      .post(RUTA)
      .set('Authorization', `Bearer ${token}`)
      .send(bodyPedido())

    expect(res.status).toBe(201)
    expect(res.body.data.orderRef).toBe('CP-ABC123')
  })
})

describe('GET /orders/my — mis pedidos', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get(`${RUTA}/my`)

    expect(res.status).toBe(401)
  })

  it('con token → 200 con los pedidos de ese usuario', async () => {
    const { user, token } = autenticar()
    prismaMock.order.findMany.mockResolvedValue([pedido({ userId: user.id })])

    const res = await request(app)
      .get(`${RUTA}/my`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })
})

describe('GET /orders — listado de admin', () => {
  it('rol USER → 403', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
  })

  it('admin → 200 con la lista paginada', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.count.mockResolvedValue(1)
    prismaMock.order.findMany.mockResolvedValue([pedido()])

    const res = await request(app)
      .get(`${RUTA}?page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 10 })
  })
})

describe('PUT /orders/:id/status — cambiar estado', () => {
  it('rol USER → 403', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .put(`${RUTA}/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SHIPPED' })

    expect(res.status).toBe(403)
  })

  it('estado inválido → 400 Datos inválidos', async () => {
    const { token } = autenticarAdmin()

    const res = await request(app)
      .put(`${RUTA}/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INVENTADO' })

    expect(res.status).toBe(400)
  })

  it('pedido inexistente → 404', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put(`${RUTA}/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SHIPPED' })

    expect(res.status).toBe(404)
  })

  it('transición válida → 200 con el estado nuevo', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.findUnique.mockResolvedValue(pedido())
    prismaMock.order.update.mockResolvedValue(pedido({ status: 'SHIPPED' }))

    const res = await request(app)
      .put(`${RUTA}/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SHIPPED' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('SHIPPED')
  })
})
