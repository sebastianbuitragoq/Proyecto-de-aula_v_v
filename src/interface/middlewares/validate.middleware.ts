import { NextFunction, Request, Response } from 'express'
import { ZodSchema } from 'zod'

type Origen = 'body' | 'query' | 'params'

export function validate(schema: ZodSchema, source: Origen = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source])

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))
      res.status(400).json({ error: 'Datos inválidos', errors })
      return
    }

    // Se reescribe con el dato ya parseado: los coerce y los default del
    // esquema solo sirven si lo que sigue lee el resultado, no el crudo.
    if (source === 'body') {
      req.body = result.data
    } else if (source === 'query') {
      req.query = result.data as Record<string, string>
    } else {
      req.params = result.data as Record<string, string>
    }

    next()
  }
}
  