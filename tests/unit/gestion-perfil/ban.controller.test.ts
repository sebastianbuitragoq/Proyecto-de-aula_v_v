import { describe, expect, it, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ban } from '../../../src/interface/controllers/admin.controller'
import { prismaMock } from '../../helpers/prisma-mock'
import {
  ID_INEXISTENTE,
  errorRegistroNoEncontrado,
  usuarioConConteo,
} from '../../helpers/fixtures'

// Basado en: interface/controllers/admin.controller.ts — ban()
//          + application/use-cases/admin.use-cases.ts — banUser()
//
// admin.controller.ts crea su propio `const repo = new AdminRepository()` al
// cargar el módulo, así que el controlador, el caso de uso y el repositorio
// corren de verdad; lo único sustituido es el cliente Prisma. res y next son
// objetos falsos porque es lo que Express le pasaría.

function makeRes() {
  const res: Partial<Response> = {}
  res.json = vi.fn().mockReturnValue(res)
  return res as Response
}

// El controlador toma el id del administrador que hace la petición desde el
// token ya verificado (req.user), y se lo pasa al caso de uso como cuarto
// argumento para que pueda aplicar la regla RN-05 (nadie se banea a sí mismo).
function makeReq(id: string, requesterId: string) {
  return {
    params: { id },
    body: { reason: 'spam' },
    user: { id: requesterId, role: 'ADMIN', iat: 1, exp: 2 },
  } as unknown as Request
}

describe('admin.controller — ban()', () => {
  // Camino 1,2,3,4,5,F — id existente, reason válido
  it('responde con el usuario baneado cuando banUser() resuelve sin error', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })
    const victima = usuarioConConteo({ banned: true, banReason: 'spam' })
    prismaMock.user.update.mockResolvedValue(victima)

    const req = makeReq(victima.id, admin.id)
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await ban(req, res, next)

    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: victima.id,
        banned: true,
        banReason: 'spam',
      }),
    })
    expect(next).not.toHaveBeenCalled()
  })

  // Camino 1,2,3,4,6,F — banUser() lanza error (id inexistente)
  it('invoca next(error) cuando el id no existe', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })
    prismaMock.user.update.mockRejectedValue(errorRegistroNoEncontrado())

    const req = makeReq(ID_INEXISTENTE, admin.id)
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await ban(req, res, next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Usuario no encontrado',
        statusCode: 404,
      }),
    )
    expect(res.json).not.toHaveBeenCalled()
  })

  it('le pasa al caso de uso el id del admin que hace la petición, y ese admin no puede banearse a sí mismo', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })

    const req = makeReq(admin.id, admin.id)
    const res = makeRes()
    const next = vi.fn() as NextFunction

    await ban(req, res, next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No puedes banear tu propia cuenta' }),
    )
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
