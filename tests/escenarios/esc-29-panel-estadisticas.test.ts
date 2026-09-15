import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import {
  autenticar,
  autenticarAdmin,
  tokenConFirmaInvalida,
} from '../helpers/fixtures'

/**
 * ESC-29 — Panel de estadísticas
 * GET /api/v1/admin/stats
 *
 * V(G) = 6. Los tres últimos caminos recorren el bucle que suma los ingresos:
 * sin pedidos, con un pedido que sí suma, y con un pedido cancelado que se
 * salta.
 */

const RUTA = '/api/v1/admin/stats'

type Estado = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

interface PedidoAgrupado {
  status: Estado
  count: number
  sum: number
}

/**
 * Programa las nueve consultas que hace getStats(), en el mismo orden en que
 * las lanza el repositorio: los conteos de usuarios y celulares, el groupBy y
 * el aggregate de pedidos, los 8 pedidos recientes y, por último, los pedidos
 * de los últimos 7 días que alimentan revenueByDay.
 */
function programarEstadisticas(
  pedidos: PedidoAgrupado[] = [],
  revenueDelMes = 0,
) {
  prismaMock.user.count.mockResolvedValue(0)
  prismaMock.phone.count.mockResolvedValue(0)

  prismaMock.order.groupBy.mockResolvedValue(
    pedidos.map((p) => ({
      status: p.status,
      _count: { _all: p.count },
      _sum: { total: p.sum },
    })),
  )
  prismaMock.order.aggregate.mockResolvedValue({
    _sum: { total: revenueDelMes },
  })

  // Primera llamada: los pedidos recientes del panel.
  prismaMock.order.findMany.mockResolvedValueOnce([])
  // Segunda: los de los últimos 7 días, para el desglose diario.
  prismaMock.order.findMany.mockResolvedValueOnce([])
}

describe('ESC-29 — Panel de estadísticas', () => {
  it('Camino 1 (1-2-14): sin cabecera Bearer → 401 Token requerido', async () => {
    const res = await request(app).get(RUTA)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token requerido')
    expect(prismaMock.order.groupBy).not.toHaveBeenCalled()
  })

  it('Camino 2 (1-3-4-14): firma inválida → 401 Token inválido o expirado', async () => {
    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${tokenConFirmaInvalida()}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token inválido o expirado')
    expect(prismaMock.order.groupBy).not.toHaveBeenCalled()
  })

  it('Camino 3 (1-3-5-6-14): rol USER → 403 Acceso restringido', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Acceso restringido a administradores')
    expect(prismaMock.order.groupBy).not.toHaveBeenCalled()
  })

  it('Camino 4 (1-3-5-7-8-9-13-14): sin pedidos → 200 con los ingresos en 0', async () => {
    const { token } = autenticarAdmin()
    programarEstadisticas([])

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.orders).toMatchObject({ total: 0, revenue: 0 })
  })

  it('Camino 5 (1-3-5-7-8-9-10-11-9-13-14): pedido no cancelado → suma su total a los ingresos', async () => {
    const { token } = autenticarAdmin()
    programarEstadisticas([
      { status: 'DELIVERED', count: 1, sum: 3_500_000 },
    ])

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.orders).toMatchObject({
      total: 1,
      delivered: 1,
      cancelled: 0,
      revenue: 3_500_000,
    })
  })

  it('Camino 6 (1-3-5-7-8-9-10-12-9-13-14): pedido cancelado → no se suma a los ingresos', async () => {
    const { token } = autenticarAdmin()
    programarEstadisticas([
      { status: 'CANCELLED', count: 1, sum: 3_500_000 },
    ])

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.orders).toMatchObject({
      total: 1,
      cancelled: 1,
      // El pedido se cuenta, pero su dinero no entra a los ingresos.
      revenue: 0,
    })
  })

  it('Con pedidos mezclados solo suma los que no están cancelados', async () => {
    const { token } = autenticarAdmin()
    programarEstadisticas([
      { status: 'DELIVERED', count: 2, sum: 5_000_000 },
      { status: 'PENDING', count: 1, sum: 1_000_000 },
      { status: 'CANCELLED', count: 3, sum: 9_000_000 },
    ])

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.orders).toMatchObject({
      total: 6,
      delivered: 2,
      pending: 1,
      cancelled: 3,
      // 5.000.000 + 1.000.000, sin los 9.000.000 cancelados.
      revenue: 6_000_000,
    })
  })

  it('El panel siempre devuelve los 7 días de ingresos', async () => {
    const { token } = autenticarAdmin()
    programarEstadisticas([])

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.revenueByDay).toHaveLength(7)
  })

  it('Un pedido de hoy aparece en el último día del desglose diario', async () => {
    const { token } = autenticarAdmin()
    programarEstadisticas([{ status: 'DELIVERED', count: 1, sum: 800_000 }])
    // Se reprograman las dos findMany: la segunda devuelve el pedido de hoy.
    prismaMock.order.findMany.mockReset()
    prismaMock.order.findMany.mockResolvedValueOnce([])
    prismaMock.order.findMany.mockResolvedValueOnce([
      { total: 800_000, createdAt: new Date() },
    ])

    const res = await request(app)
      .get(RUTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const dias = res.body.data.revenueByDay
    expect(dias).toHaveLength(7)
    expect(dias[6]).toMatchObject({ amount: 800_000, count: 1 })
  })
})
