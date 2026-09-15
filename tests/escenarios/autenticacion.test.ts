import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import {
  autenticar,
  tokenConFirmaInvalida,
  usuario,
} from '../helpers/fixtures'

/**
 * Endpoints de autenticación
 * POST /api/v1/auth/register · POST /api/v1/auth/login · GET /api/v1/auth/me
 *
 * Recorren el controlador de auth completo, que hasta ahora solo se ejercía
 * indirectamente desde los casos de uso.
 */

const REGISTRO = '/api/v1/auth/register'
const LOGIN = '/api/v1/auth/login'
const PERFIL = '/api/v1/auth/me'

const CREDENCIALES = { email: 'nuevo@correo.com', password: 'password123' }

describe('POST /auth/register', () => {
  it('body inválido → 400 Datos inválidos', async () => {
    const res = await request(app).post(REGISTRO).send({ email: 'no-es-email' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('email ya registrado → 409', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({ email: CREDENCIALES.email }),
    )

    const res = await request(app)
      .post(REGISTRO)
      .send({ ...CREDENCIALES, name: 'Persona Nueva' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('El email ya está registrado')
  })

  it('datos correctos → 201 con el usuario y su token, sin la contraseña', async () => {
    const creado = usuario({ email: CREDENCIALES.email, name: 'Persona Nueva' })
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue(creado)

    const res = await request(app)
      .post(REGISTRO)
      .send({ ...CREDENCIALES, name: 'Persona Nueva' })

    expect(res.status).toBe(201)
    expect(res.body.data.user.email).toBe(CREDENCIALES.email)
    expect(res.body.data.user).not.toHaveProperty('password')
    expect(typeof res.body.data.token).toBe('string')
  })
})

describe('POST /auth/login', () => {
  it('credenciales incorrectas → 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await request(app).post(LOGIN).send(CREDENCIALES)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Credenciales inválidas')
  })

  it('cuenta suspendida → 403 con el motivo', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({
        email: CREDENCIALES.email,
        password: CREDENCIALES.password,
        banned: true,
        banReason: 'fraude en pagos',
      }),
    )

    const res = await request(app).post(LOGIN).send(CREDENCIALES)

    expect(res.status).toBe(403)
    expect(res.body.error).toContain('fraude en pagos')
  })

  it('credenciales correctas → 200 con el token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({ email: CREDENCIALES.email, password: CREDENCIALES.password }),
    )

    const res = await request(app).post(LOGIN).send(CREDENCIALES)

    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
    expect(res.body.data.user).not.toHaveProperty('password')
  })
})

describe('GET /auth/me', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get(PERFIL)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token requerido')
  })

  it('token con firma inválida → 401', async () => {
    const res = await request(app)
      .get(PERFIL)
      .set('Authorization', `Bearer ${tokenConFirmaInvalida()}`)

    expect(res.status).toBe(401)
  })

  it('token válido → 200 con el perfil completo leído de la base', async () => {
    const { user, token } = autenticar({ name: 'Persona Registrada' })

    const res = await request(app)
      .get(PERFIL)
      .set('Authorization', `Bearer ${token}`)

    // El JWT solo carga id y role: name y email tienen que venir de la base.
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      id: user.id,
      email: user.email,
      name: 'Persona Registrada',
    })
    expect(res.body.data).not.toHaveProperty('password')
  })

  it('el usuario del token ya no existe → 401', async () => {
    const { token } = autenticar()
    // Entre la emisión del token y esta petición borraron la cuenta.
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(PERFIL)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })
})
