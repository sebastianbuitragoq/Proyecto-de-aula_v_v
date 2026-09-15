import { describe, expect, it, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { authenticate } from '../../../src/interface/middlewares/auth.middleware'
import { prismaMock } from '../../helpers/prisma-mock'
import {
  ID_INEXISTENTE,
  generarToken,
  tokenConFirmaInvalida,
  usuario,
} from '../../helpers/fixtures'

// Basado en: interface/middlewares/auth.middleware.ts — authenticate()
//
// El middleware no se queda con lo que dice el token: después de verificar la
// firma va a la base a releer el estado vigente del usuario. Así, si a alguien
// lo banean o le bajan el rol, el cambio aplica de inmediato sin esperar a que
// expire la sesión. jwt.sign/jwt.verify son reales (generarToken() firma con
// el mismo JWT_SECRET que usa el servidor); lo único sustituido es la lectura
// de la fila, que es justo lo que cada caso necesita controlar.

function makeRes() {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as Response
}

describe('authenticate middleware', () => {
  // Camino 1,2,3,F — sin header Authorization o sin prefijo Bearer
  it('responde 401 "Token requerido" si no hay header Authorization', async () => {
    const req = { headers: {} } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token requerido' })
    expect(next).not.toHaveBeenCalled()
  })

  it('responde 401 "Token requerido" si el header no tiene el prefijo Bearer', async () => {
    const req = { headers: { authorization: 'Token abc123' } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  // Camino 1,2,4,5,6,7,F — token presente pero inválido o expirado
  it('responde 401 "Token inválido o expirado" si la firma no corresponde al JWT_SECRET del servidor', async () => {
    const req = {
      headers: { authorization: `Bearer ${tokenConFirmaInvalida()}` },
    } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido o expirado' })
    expect(next).not.toHaveBeenCalled()
  })

  it('responde 401 "Token inválido o expirado" si el token ya venció', async () => {
    const tokenVencido = jwt.sign({ id: ID_INEXISTENTE, role: 'USER' }, process.env.JWT_SECRET as string, {
      expiresIn: -1, // ya vencido al momento de firmarlo
    })
    const req = { headers: { authorization: `Bearer ${tokenVencido}` } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido o expirado' })
    expect(next).not.toHaveBeenCalled()
  })

  // Firma válida, pero el usuario ya no está en la base
  it('responde 401 si el token es válido pero el usuario ya no existe', async () => {
    const token = jwt.sign({ id: ID_INEXISTENTE, role: 'USER' }, process.env.JWT_SECRET as string, {
      expiresIn: '1h',
    })
    prismaMock.user.findUnique.mockResolvedValue(null)

    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  // Firma válida, pero la cuenta fue suspendida después de emitir el token
  it('responde 403 con el motivo si la cuenta está baneada', async () => {
    const user = usuario({ banned: true, banReason: 'fraude en pagos' })
    prismaMock.user.findUnique.mockResolvedValue(user)
    const token = generarToken(user)

    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('fraude en pagos'),
    })
    expect(next).not.toHaveBeenCalled()
  })

  // Camino 1,2,4,5,6,8,9,F — token válido y cuenta activa
  it('asigna req.user y llama a next() si el token es válido', async () => {
    const user = usuario()
    prismaMock.user.findUnique.mockResolvedValue(user)
    const token = generarToken(user)

    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await authenticate(req, res, next)

    expect(req.user).toMatchObject({ id: user.id, role: 'USER' })
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  // El rol se toma de la base, no del token: una degradación de ADMIN a USER
  // surte efecto sin esperar a que la sesión expire.
  it('usa el rol vigente en la base y no el que trae el token', async () => {
    const user = usuario({ role: 'USER' })
    prismaMock.user.findUnique.mockResolvedValue(user)
    // El token quedó firmado como ADMIN antes de que lo degradaran a USER.
    const token = jwt.sign({ id: user.id, role: 'ADMIN' }, process.env.JWT_SECRET as string, {
      expiresIn: '1h',
    })

    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    const next = vi.fn() as NextFunction

    await authenticate(req, makeRes(), next)

    expect(req.user?.role).toBe('USER')
    expect(next).toHaveBeenCalledTimes(1)
  })
})
