import { z } from 'zod'

/**
 * El celular llega en la URL (/favorites/:phoneId).
 *
 * Sin esta validación, un id con formato inválido viajaría hasta Prisma y
 * saldría como 500 por un error del motor. Validado aquí, el cliente recibe
 * el mismo 400 "Datos inválidos" que en el resto de la API.
 */
export const favoritePhoneParamDto = z.object({
  phoneId: z.string().uuid('El id del celular no es un UUID válido'),
})

export type FavoritePhoneParamDto = z.infer<typeof favoritePhoneParamDto>
