import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import { autenticar, autenticarAdmin, celular } from '../helpers/fixtures'

/**
 * Catálogo público
 * GET /phones · GET /phones/:slug · GET /phones/id/:id
 *
 * Además de los controladores, cubre buildWhere() de PhoneRepository: cada
 * filtro del query se traduce a una parte distinta del WHERE.
 */

const RUTA = '/api/v1/phones'

/** Fila reducida tal como la pide el select del listado. */
function filaListado(cambios: Record<string, unknown> = {}) {
  return {
    id: 'tel-1',
    slug: 'telefono-1',
    name: 'Teléfono 1',
    brand: 'Apple',
    price: 1_000_000,
    compareAt: null,
    badge: null,
    stock: 3,
    condition: 'NEW',
    verified: true,
    batteryHealth: null,
    storage: '128GB',
    ram: '6GB',
    shortDesc: null,
    heroImage: null,
    category: { name: 'Apple' },
    ...cambios,
  }
}

describe('GET /phones — listado público', () => {
  it('sin filtros → 200 con la lista paginada y el WHERE vacío', async () => {
    prismaMock.phone.count.mockResolvedValue(1)
    prismaMock.phone.findMany.mockResolvedValue([filaListado()])

    const res = await request(app).get(RUTA)

    expect(prismaMock.phone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 12 }),
    )
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 12 })
  })

  it('limit fuera de rango → 400 Datos inválidos', async () => {
    // El esquema tope el limit en 50.
    const res = await request(app).get(`${RUTA}?limit=51`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
    expect(prismaMock.phone.findMany).not.toHaveBeenCalled()
  })

  it('verified=false filtra por los NO verificados', async () => {
    prismaMock.phone.count.mockResolvedValue(0)
    prismaMock.phone.findMany.mockResolvedValue([])

    await request(app).get(`${RUTA}?verified=false`)

    // Con z.coerce.boolean() esto llegaba como true y filtraba al revés.
    expect(prismaMock.phone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { verified: false } }),
    )
  })

  it('verified con un valor que no es true/false → 400', async () => {
    const res = await request(app).get(`${RUTA}?verified=quizas`)

    expect(res.status).toBe(400)
  })

  it('cada filtro se traduce a su parte del WHERE', async () => {
    prismaMock.phone.count.mockResolvedValue(0)
    prismaMock.phone.findMany.mockResolvedValue([])

    await request(app).get(
      `${RUTA}?category=apple&brand=Apple&condition=NEW&minPrice=100000&maxPrice=2000000&search=iphone`,
    )

    expect(prismaMock.phone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          categoryId: 'apple',
          brand: { equals: 'Apple', mode: 'insensitive' },
          condition: 'NEW',
          price: { gte: 100_000, lte: 2_000_000 },
          OR: [
            { name: { contains: 'iphone', mode: 'insensitive' } },
            { brand: { contains: 'iphone', mode: 'insensitive' } },
            { shortDesc: { contains: 'iphone', mode: 'insensitive' } },
          ],
        },
      }),
    )
  })

  it('la segunda página salta los resultados de la primera', async () => {
    prismaMock.phone.count.mockResolvedValue(30)
    prismaMock.phone.findMany.mockResolvedValue([])

    const res = await request(app).get(`${RUTA}?page=3&limit=10`)

    expect(prismaMock.phone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    )
    expect(res.body.meta).toMatchObject({ total: 30, totalPages: 3 })
  })
})

describe('GET /phones/:slug — detalle público', () => {
  it('slug inexistente → 404', async () => {
    prismaMock.phone.findUnique.mockResolvedValue(null)

    const res = await request(app).get(`${RUTA}/no-existe`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Celular no encontrado')
  })

  it('slug existente → 200 con el celular y sus relaciones', async () => {
    const telefono = celular({ slug: 'iphone-15' })
    prismaMock.phone.findUnique.mockResolvedValue(telefono)

    const res = await request(app).get(`${RUTA}/iphone-15`)

    expect(prismaMock.phone.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'iphone-15' } }),
    )
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ slug: 'iphone-15' })
  })
})

describe('GET /phones/id/:id — detalle por UUID (solo admin)', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get(`${RUTA}/id/tel-1`)

    expect(res.status).toBe(401)
  })

  it('rol USER → 403: expone el registro crudo, así que no es pública', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .get(`${RUTA}/id/tel-1`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
  })

  it('admin con id inexistente → 404', async () => {
    const { token } = autenticarAdmin()
    prismaMock.phone.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(`${RUTA}/id/tel-1`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  it('admin con id existente → 200', async () => {
    const { token } = autenticarAdmin()
    const telefono = celular()
    prismaMock.phone.findUnique.mockResolvedValue(telefono)

    const res = await request(app)
      .get(`${RUTA}/id/${telefono.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(telefono.id)
  })
})

describe('Rutas que no existen', () => {
  it('devuelve 404 Ruta no encontrada', async () => {
    const res = await request(app).get('/api/v1/inventado')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Ruta no encontrada')
  })

  it('/health responde ok', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
