import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import {
  autenticar,
  autenticarAdmin,
  bodyCelularValido,
  celular,
  usuario,
} from '../helpers/fixtures'

/**
 * Últimas ramas sin recorrer: los catch de los controladores que solo se
 * activan ante un fallo de infraestructura, los estados terminales de un
 * pedido y los mensajes que cambian según haya o no motivo de baneo.
 */

beforeEach(() => {
  // error.middleware loggea el error antes de responder; se silencia para
  // que el reporte de la suite quede limpio.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Fallos al consultar listados', () => {
  it('si falla la consulta de mis pedidos → 500', async () => {
    const { token } = autenticar()
    prismaMock.order.findMany.mockRejectedValue(new Error('timeout'))

    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })

  it('si falla el conteo del catálogo → 500', async () => {
    prismaMock.phone.count.mockRejectedValue(new Error('timeout'))

    const res = await request(app).get('/api/v1/phones')

    expect(res.status).toBe(500)
  })

  it('si falla la consulta del listado de usuarios → 500', async () => {
    const { token } = autenticarAdmin()
    prismaMock.user.count.mockRejectedValue(new Error('timeout'))

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })

  it('si falla la lectura del perfil después de validar el token → 500', async () => {
    const { user, token } = autenticar()
    // La primera lectura es la del middleware y funciona; la segunda, la que
    // hace getProfile() para armar el perfil, se cae.
    prismaMock.user.findUnique.mockReset()
    prismaMock.user.findUnique.mockResolvedValueOnce(user)
    prismaMock.user.findUnique.mockRejectedValueOnce(new Error('timeout'))

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })

  it('si el usuario desaparece entre validar el token y leer el perfil → 404', async () => {
    const { user, token } = autenticar()
    // El middleware alcanza a leerlo, pero para cuando getProfile() consulta
    // de nuevo la fila ya no está (se borró la cuenta en medio).
    prismaMock.user.findUnique.mockReset()
    prismaMock.user.findUnique.mockResolvedValueOnce(user)
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Usuario no encontrado')
  })
})

describe('En producción no se filtra el detalle del error', () => {
  it('la respuesta 500 no expone el mensaje interno', async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const { token } = autenticarAdmin()
    prismaMock.order.count.mockRejectedValue(
      new Error('relation "orders" does not exist en 127.0.0.1:5432'),
    )

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error interno del servidor')
    // Fuera de producción sí viaja `detail`; aquí filtraría la tabla y el host.
    expect(res.body).not.toHaveProperty('detail')

    process.env.NODE_ENV = original
  })

  it('fuera de producción sí incluye el detalle, para diagnosticar', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.count.mockRejectedValue(new Error('fallo de prueba'))

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
    expect(res.body.detail).toBe('fallo de prueba')
  })
})

describe('Estados terminales de un pedido', () => {
  const ORDER_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

  it('un pedido entregado no admite más cambios', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: 'DELIVERED',
      items: [],
    })

    const res = await request(app)
      .put(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SHIPPED' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('estado final')
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it('si falla la escritura del nuevo estado → 500', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: 'CONFIRMED',
      items: [],
    })
    prismaMock.order.update.mockRejectedValue(new Error('deadlock detected'))

    const res = await request(app)
      .put(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SHIPPED' })

    expect(res.status).toBe(500)
  })

  it('un pedido cancelado tampoco revive', async () => {
    const { token } = autenticarAdmin()
    prismaMock.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: 'CANCELLED',
      items: [],
    })

    const res = await request(app)
      .put(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONFIRMED' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('estado final')
  })
})

describe('Mensaje de cuenta suspendida', () => {
  it('sin motivo registrado, el mensaje no inventa uno', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({
        email: 'baneado@correo.com',
        password: 'password123',
        banned: true,
        banReason: null,
      }),
    )

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'baneado@correo.com', password: 'password123' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Tu cuenta ha sido suspendida.')
    expect(res.body.error).not.toContain('Motivo')
  })

  it('el middleware tampoco inventa motivo cuando no lo hay', async () => {
    const { token } = autenticar()
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({ banned: true, banReason: null }),
    )

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Tu cuenta ha sido suspendida.')
  })
})

describe('Un celular con todas sus relaciones', () => {
  const PHONE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
  const CELULARES = '/api/v1/phones'

  /** Fila con imágenes, colores y características, como la trae phoneInclude. */
  function celularCompleto() {
    return {
      ...celular({ id: PHONE_ID }),
      images: [{ id: 1, url: 'https://cdn.test/1.jpg', position: 0 }],
      colors: [{ id: 1, colorId: 'negro', name: 'Negro', hex: '#000000' }],
      features: [{ id: 1, feature: 'Carga rápida', position: 0 }],
    }
  }

  const relacionesEnviadas = {
    images: [{ url: 'https://cdn.test/1.jpg', position: 0 }],
    colors: [{ colorId: 'negro', name: 'Negro', hex: '#000000' }],
    features: ['Carga rápida'],
  }

  it('al crearlo, se guardan las relaciones y vuelven ya mapeadas', async () => {
    const { token } = autenticarAdmin()
    prismaMock.phone.findUnique.mockResolvedValue(null)
    prismaMock.phone.create.mockResolvedValue(celularCompleto())

    const res = await request(app)
      .post(CELULARES)
      .set('Authorization', `Bearer ${token}`)
      .send(bodyCelularValido(relacionesEnviadas))

    expect(res.status).toBe(201)
    expect(res.body.data.images[0]).toMatchObject({
      url: 'https://cdn.test/1.jpg',
      position: 0,
    })
    expect(res.body.data.colors[0]).toMatchObject({
      colorId: 'negro',
      name: 'Negro',
      hex: '#000000',
    })
    // Las características viajan como objetos en la base y como texto plano
    // hacia afuera.
    expect(res.body.data.features).toEqual(['Carga rápida'])
  })

  it('al editarlo, las relaciones se reemplazan por completo', async () => {
    const { token } = autenticarAdmin()
    prismaMock.phone.findUnique.mockResolvedValue(celularCompleto())
    prismaMock.phone.update.mockResolvedValue(celularCompleto())

    const res = await request(app)
      .put(`${CELULARES}/${PHONE_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send(relacionesEnviadas)

    expect(res.status).toBe(200)
    // deleteMany + create: se borra lo anterior antes de escribir lo nuevo.
    const [args] = prismaMock.phone.update.mock.calls[0] as [
      { data: Record<string, { deleteMany?: unknown }> },
    ]
    expect(args.data.images.deleteMany).toEqual({})
    expect(args.data.colors.deleteMany).toEqual({})
    expect(args.data.features.deleteMany).toEqual({})
  })
})

describe('Filas incompletas que llegan del motor', () => {
  it('si el usuario viene sin el conteo de pedidos, el panel muestra 0', async () => {
    const { token } = autenticarAdmin()
    // usuario() no trae _count; usuarioConConteo() sí. Este es el caso en que
    // la consulta se hizo sin el include y mapUser tiene que resolverlo.
    const objetivo = usuario({ banned: true, banReason: 'incumplimiento' })
    prismaMock.user.update.mockResolvedValue(objetivo)

    const res = await request(app)
      .put(`/api/v1/admin/users/${objetivo.id}/ban`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'incumplimiento' })

    expect(res.status).toBe(200)
    expect(res.body.data.orderCount).toBe(0)
  })

  it('un groupBy sin sumas (todas en null) no rompe los ingresos', async () => {
    const { token } = autenticarAdmin()
    prismaMock.user.count.mockResolvedValue(0)
    prismaMock.phone.count.mockResolvedValue(0)
    // Postgres devuelve NULL al sumar un conjunto vacío de filas.
    prismaMock.order.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 1 }, _sum: { total: null } },
      { status: 'CONFIRMED', _count: { _all: 2 }, _sum: { total: null } },
      { status: 'SHIPPED', _count: { _all: 3 }, _sum: { total: null } },
      { status: 'DELIVERED', _count: { _all: 4 }, _sum: { total: null } },
      { status: 'CANCELLED', _count: { _all: 5 }, _sum: { total: null } },
    ])
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: null } })
    prismaMock.order.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.orders).toMatchObject({
      total: 15,
      pending: 1,
      confirmed: 2,
      shipped: 3,
      delivered: 4,
      cancelled: 5,
      revenue: 0,
      revenueThisMonth: 0,
    })
  })
})

describe('CORS', () => {
  it('sin FRONTEND_URL configurado, acepta cualquier origen', async () => {
    const original = process.env.FRONTEND_URL
    process.env.FRONTEND_URL = ''
    vi.resetModules()

    const { default: appSinOrigen } = await import('../../src/app')
    const res = await request(appSinOrigen).get('/health')

    expect(res.headers['access-control-allow-origin']).toBe('*')

    process.env.FRONTEND_URL = original
    vi.resetModules()
  })

  it('con FRONTEND_URL configurado, responde con ese origen', async () => {
    const original = process.env.FRONTEND_URL
    process.env.FRONTEND_URL = 'https://celularpro.co'
    vi.resetModules()

    const { default: appConOrigen } = await import('../../src/app')
    const res = await request(appConOrigen).get('/health')

    expect(res.headers['access-control-allow-origin']).toBe(
      'https://celularpro.co',
    )

    process.env.FRONTEND_URL = original
    vi.resetModules()
  })
})
