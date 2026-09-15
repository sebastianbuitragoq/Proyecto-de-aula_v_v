import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { AppError } from '../../../src/domain/AppError'
import { errorHandler } from '../../../src/interface/middlewares/error.middleware'

/**
 * errorHandler aislado de Express.
 *
 * El resto de la suite lo ejercita de rebote, a través de peticiones HTTP.
 * Aquí se le pasan errores a mano para fijar las tres respuestas que tiene
 * que dar —AppError, ZodError y cualquier otra cosa— y, sobre todo, para
 * dejar cubierto que en producción no se filtra el detalle interno.
 */

let req: Request
let res: Response
let next: NextFunction
let json: ReturnType<typeof vi.fn>
let status: ReturnType<typeof vi.fn>

const entornoOriginal = process.env.NODE_ENV

/** Produce un ZodError de verdad, en vez de inventar uno a mano. */
function errorDeZod(esquema: z.ZodTypeAny, valor: unknown): z.ZodError {
  const resultado = esquema.safeParse(valor)
  if (resultado.success) {
    throw new Error('El esquema de prueba debía fallar y no falló')
  }
  return resultado.error
}

beforeEach(() => {
  json = vi.fn()
  status = vi.fn().mockReturnValue({ json })
  req = {} as Request
  res = { status } as unknown as Response
  next = vi.fn() as NextFunction
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env.NODE_ENV = entornoOriginal
})

describe('AppError — errores esperados del negocio', () => {
  it('responde con el código y el mensaje que trae el error', () => {
    errorHandler(new AppError('Credenciales inválidas', 401), req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Credenciales inválidas' })
  })

  it('no ensucia la consola: un 403 no es una falla del servidor', () => {
    errorHandler(new AppError('Acceso restringido', 403), req, res, next)

    expect(console.error).not.toHaveBeenCalled()
  })

  it('respeta el código de cada caso', () => {
    const casos: [string, number][] = [
      ['Token requerido', 401],
      ['Acceso restringido', 403],
      ['Orden no encontrada', 404],
      ['El email ya está registrado', 409],
    ]

    for (const [mensaje, codigo] of casos) {
      errorHandler(new AppError(mensaje, codigo), req, res, next)
      expect(status).toHaveBeenCalledWith(codigo)
    }
  })
})

describe('ZodError — red de seguridad de validación', () => {
  const esquema = z.object({ status: z.enum(['PENDING', 'CANCELLED']) })

  it('un dato de entrada malo es 400, no 500', () => {
    errorHandler(errorDeZod(esquema, { status: 'INVENTADO' }), req, res, next)

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Datos inválidos' }),
    )
  })

  it('cada problema de Zod sale como { field, message }', () => {
    errorHandler(errorDeZod(esquema, { status: 'INVENTADO' }), req, res, next)

    expect(json).toHaveBeenCalledWith({
      error: 'Datos inválidos',
      errors: [{ field: 'status', message: expect.any(String) }],
    })
  })

  it('con varios campos malos, sale uno por campo', () => {
    const varios = z.object({
      email: z.string().email(),
      qty: z.number().positive(),
    })

    errorHandler(
      errorDeZod(varios, { email: 'no-es-email', qty: -1 }),
      req,
      res,
      next,
    )

    expect(json).toHaveBeenCalledWith({
      error: 'Datos inválidos',
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'qty' }),
      ]),
    })
  })

  it('tampoco se loggea: la culpa es del cliente, no del servidor', () => {
    errorHandler(errorDeZod(esquema, { status: 'INVENTADO' }), req, res, next)

    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('Cualquier otro error — 500', () => {
  it('el cliente recibe un mensaje genérico', () => {
    process.env.NODE_ENV = 'development'

    errorHandler(new Error('Connection timeout'), req, res, next)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Error interno del servidor' }),
    )
  })

  it('fuera de producción sí viaja el detalle, para diagnosticar', () => {
    process.env.NODE_ENV = 'development'

    errorHandler(new Error('Connection timeout'), req, res, next)

    expect(json).toHaveBeenCalledWith({
      error: 'Error interno del servidor',
      detail: 'Connection timeout',
    })
  })

  it('en producción no se filtra nada del error interno', () => {
    process.env.NODE_ENV = 'production'
    // Un mensaje de driver puede arrastrar host, tabla y hasta credenciales.
    const err = new Error('timeout host=db.internal user=admin')

    errorHandler(err, req, res, next)

    expect(json).toHaveBeenCalledWith({ error: 'Error interno del servidor' })
    expect(json).not.toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.anything() }),
    )
  })

  it('el log del servidor conserva mensaje y traza, aunque el cliente no los vea', () => {
    process.env.NODE_ENV = 'production'
    const err = new Error('Something broke')
    err.stack = 'Error: Something broke\n    at algo (archivo.ts:10:5)'

    errorHandler(err, req, res, next)

    expect(console.error).toHaveBeenCalledWith('[ERROR 500]', 'Something broke')
    expect(console.error).toHaveBeenCalledWith(err.stack)
  })
})

describe('En todos los casos', () => {
  it('nunca delega con next(): el manejador es el último de la cadena', () => {
    errorHandler(new AppError('X', 400), req, res, next)
    errorHandler(errorDeZod(z.object({ x: z.string() }), { x: 123 }), req, res, next)
    errorHandler(new Error('Y'), req, res, next)

    expect(next).not.toHaveBeenCalled()
  })
})
