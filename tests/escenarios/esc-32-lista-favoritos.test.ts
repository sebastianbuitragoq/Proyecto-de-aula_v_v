import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import {
  ID_INEXISTENTE,
  autenticar,
  celular,
  favorito,
  tokenConFirmaInvalida,
} from '../helpers/fixtures'

/**
 * ESC-32 — Lista de favoritos
 * GET / POST / DELETE /api/v1/favorites
 *
 * A diferencia del resto de escenarios, estas rutas solo exigen estar
 * autenticado: no hay requireAdmin. El usuario sale del token, así que nadie
 * puede leer ni tocar la lista de otro.
 */

const LISTA = '/api/v1/favorites'
const ITEM = (phoneId: string) => `${LISTA}/${phoneId}`

const PHONE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('Acceso a la lista', () => {
  it('Camino 1: sin cabecera Bearer → 401 Token requerido', async () => {
    const res = await request(app).get(LISTA)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token requerido')
    expect(prismaMock.favorite.findMany).not.toHaveBeenCalled()
  })

  it('Camino 2: firma inválida → 401 Token inválido o expirado', async () => {
    const res = await request(app)
      .get(LISTA)
      .set('Authorization', `Bearer ${tokenConFirmaInvalida()}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token inválido o expirado')
  })

  it('no hace falta ser administrador: un usuario corriente entra', async () => {
    const { token } = autenticar()
    prismaMock.favorite.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(LISTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })
})

describe('Camino 3: agregar un celular a favoritos', () => {
  it('con un celular que existe → 201 y queda marcado', async () => {
    const { user, token } = autenticar()
    prismaMock.phone.findUnique.mockResolvedValue(celular({ id: PHONE_ID }))

    const res = await request(app)
      .post(ITEM(PHONE_ID))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(201)
    expect(res.body.data).toEqual({ phoneId: PHONE_ID, favorited: true })
    expect(prismaMock.favorite.upsert).toHaveBeenCalledWith({
      where: { userId_phoneId: { userId: user.id, phoneId: PHONE_ID } },
      update: {},
      create: { userId: user.id, phoneId: PHONE_ID },
    })
  })

  it('Camino 4: el id de la URL no es un UUID → 400 Datos inválidos', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .post(ITEM('no-es-un-uuid'))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
    // Ni siquiera se consulta el catálogo: la guarda corta antes.
    expect(prismaMock.phone.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.favorite.upsert).not.toHaveBeenCalled()
  })

  it('Camino 5: UUID bien formado pero que no existe → 404 Celular no encontrado', async () => {
    const { token } = autenticar()
    prismaMock.phone.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(ITEM(ID_INEXISTENTE))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Celular no encontrado')
    // Lo importante: no se escribe una fila que la clave foránea rechazaría.
    expect(prismaMock.favorite.upsert).not.toHaveBeenCalled()
  })

  it('Camino 6: marcarlo dos veces no lo duplica (upsert, no create)', async () => {
    const { token } = autenticar()
    prismaMock.phone.findUnique.mockResolvedValue(celular({ id: PHONE_ID }))

    await request(app).post(ITEM(PHONE_ID)).set('Authorization', `Bearer ${token}`)
    const segunda = await request(app)
      .post(ITEM(PHONE_ID))
      .set('Authorization', `Bearer ${token}`)

    expect(segunda.status).toBe(201)
    // El upsert deja la fila como está si ya existía: nunca se usa create
    // directo, que es lo que chocaría contra el unique (userId, phoneId).
    expect(prismaMock.favorite.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.favorite.create).not.toHaveBeenCalled()
  })
})

describe('Camino 7 y 8: quitar de favoritos', () => {
  it('quitar uno que estaba marcado → 204 sin cuerpo', async () => {
    const { user, token } = autenticar()
    prismaMock.favorite.deleteMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .delete(ITEM(PHONE_ID))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(204)
    expect(res.body).toEqual({})
    expect(prismaMock.favorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id, phoneId: PHONE_ID },
    })
  })

  it('quitar algo que nunca estuvo marcado → 204 igual, no es un error', async () => {
    const { token } = autenticar()
    prismaMock.favorite.deleteMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .delete(ITEM(PHONE_ID))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(204)
  })

  it('el id de la URL también se valida al quitar → 400', async () => {
    const { token } = autenticar()

    const res = await request(app)
      .delete(ITEM('tampoco-es-uuid'))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(prismaMock.favorite.deleteMany).not.toHaveBeenCalled()
  })
})

describe('Camino 9: consultar la lista', () => {
  it('sin favoritos → 200 con lista vacía', async () => {
    const { token } = autenticar()
    prismaMock.favorite.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(LISTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('devuelve el celular completo, con la misma forma que el catálogo', async () => {
    const { token } = autenticar()
    const phone = celular({ id: PHONE_ID, name: 'iPhone 13', stock: 4 })
    prismaMock.favorite.findMany.mockResolvedValue([favorito({ celular: phone })])

    const res = await request(app)
      .get(LISTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      id: PHONE_ID,
      name: 'iPhone 13',
      stock: 4,
      // Campos que el compañero perdía al devolver la fila cruda de Prisma.
      images: [],
      colors: [],
      features: [],
    })
  })

  it('solo consulta los del usuario del token, nunca los de otro', async () => {
    const { user, token } = autenticar()
    prismaMock.favorite.findMany.mockResolvedValue([])

    await request(app).get(LISTA).set('Authorization', `Bearer ${token}`)

    expect(prismaMock.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
    )
  })

  it('las características vuelven como texto plano, no como filas', async () => {
    const { token } = autenticar()
    const phone = {
      ...celular({ id: PHONE_ID }),
      features: [
        { id: 1, phoneId: PHONE_ID, feature: 'Carga rápida', position: 0 },
        { id: 2, phoneId: PHONE_ID, feature: 'Resistente al agua', position: 1 },
      ],
    }
    prismaMock.favorite.findMany.mockResolvedValue([
      favorito({ celular: phone as ReturnType<typeof celular> }),
    ])

    const res = await request(app)
      .get(LISTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.body.data[0].features).toEqual([
      'Carga rápida',
      'Resistente al agua',
    ])
  })
})

describe('Fallos de infraestructura', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('si la consulta de la lista se cae → 500', async () => {
    const { token } = autenticar()
    prismaMock.favorite.findMany.mockRejectedValue(new Error('timeout'))

    const res = await request(app)
      .get(LISTA)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })

  it('si falla la escritura del favorito → 500', async () => {
    const { token } = autenticar()
    prismaMock.phone.findUnique.mockResolvedValue(celular({ id: PHONE_ID }))
    prismaMock.favorite.upsert.mockRejectedValue(new Error('deadlock detected'))

    const res = await request(app)
      .post(ITEM(PHONE_ID))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })

  it('si falla el borrado → 500', async () => {
    const { token } = autenticar()
    prismaMock.favorite.deleteMany.mockRejectedValue(new Error('timeout'))

    const res = await request(app)
      .delete(ITEM(PHONE_ID))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
  })
})
