import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prismaMock } from '../helpers/prisma-mock'
import {
  ID_INEXISTENTE,
  autenticar,
  autenticarAdmin,
  errorRegistroNoEncontrado,
  tokenConFirmaInvalida,
  usuarioConConteo,
} from '../helpers/fixtures'

/**
 * ESC-27 — Desbanear usuario
 * PUT /api/v1/admin/users/:id/unban
 *
 * V(G) = 5, así que son 5 caminos básicos.
 */

const RUTA = (id: string) => `/api/v1/admin/users/${id}/unban`

describe('ESC-27 — Desbanear usuario', () => {
  it('Camino 1 (1-2-10): sin cabecera Bearer → 401 Token requerido', async () => {
    const res = await request(app).put(RUTA(ID_INEXISTENTE))

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token requerido')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('Camino 2 (1-3-4-10): firma inválida → 401 Token inválido o expirado', async () => {
    const res = await request(app)
      .put(RUTA(ID_INEXISTENTE))
      .set('Authorization', `Bearer ${tokenConFirmaInvalida()}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Token inválido o expirado')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('Camino 3 (1-3-5-6-10): rol USER → 403 Acceso restringido', async () => {
    const { user, token } = autenticar()

    const res = await request(app)
      .put(RUTA(user.id))
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Acceso restringido a administradores')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('Camino 4 (1-3-5-7-8-10): el id no existe → 404 Usuario no encontrado', async () => {
    const { token } = autenticarAdmin()
    prismaMock.user.update.mockRejectedValue(errorRegistroNoEncontrado())

    const res = await request(app)
      .put(RUTA(ID_INEXISTENTE))
      .set('Authorization', `Bearer ${token}`)

    // DEF-27-01 corregido: antes el P2025 de Prisma salía como 500.
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Usuario no encontrado')
  })

  it('Camino 5 (1-3-5-7-9-10): usuario suspendido → 200 y se limpian los tres campos del baneo', async () => {
    const { token } = autenticarAdmin()
    const victima = usuarioConConteo()
    prismaMock.user.update.mockResolvedValue(victima)

    const res = await request(app)
      .put(RUTA(victima.id))
      .set('Authorization', `Bearer ${token}`)

    // Los tres campos del baneo se limpian juntos en la misma escritura.
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: victima.id },
        data: { banned: false, banReason: null, bannedAt: null },
      }),
    )
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      id: victima.id,
      banned: false,
      banReason: null,
      bannedAt: null,
    })
  })
})
