import { z } from 'zod'

const colorSchema = z.object({
  colorId: z.string().min(1),
  name: z.string().min(1),
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser un hex válido (#rrggbb)'),
})

const imageSchema = z.object({
  url: z.string().url('La URL de la imagen no es válida'),
  position: z.number().int().nonnegative(),
})

export const createPhoneDto = z.object({
  slug: z.string().min(3, 'El slug debe tener al menos 3 caracteres'),
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  brand: z.string().min(2, 'La marca es requerida'),
  categoryId: z.string().min(1, 'La categoría es requerida'),
  price: z.number().int().positive('El precio debe ser un entero positivo'),
  compareAt: z.number().int().positive().optional(),
  badge: z.string().optional(),
  stock: z.number().int().nonnegative('El stock no puede ser negativo'),
  // Umbral de reposición. Si no viene, se usa el mismo valor por defecto que
  // tiene la columna en la base, para que el celular quede siempre con un
  // mínimo con el que comparar.
  minStock: z
    .number()
    .int()
    .nonnegative('El stock mínimo no puede ser negativo')
    .default(5),
  condition: z.enum(['NEW', 'CERTIFIED', 'USED']),
  verified: z.boolean().default(false),
  batteryHealth: z.number().int().min(0).max(100).optional(),
  ram: z.string().optional(),
  storage: z.string().optional(),
  camera: z.string().optional(),
  battery: z.string().optional(),
  screen: z.string().optional(),
  chip: z.string().optional(),
  shortDesc: z.string().optional(),
  longDesc: z.string().optional(),
  heroImage: z.string().url('La URL del hero no es válida').optional(),
  images: z.array(imageSchema).default([]),
  colors: z.array(colorSchema).default([]),
  features: z.array(z.string()).default([]),
})

export const updatePhoneDto = createPhoneDto.partial()

export const phonesQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  category: z.string().optional(),
  brand: z.string().optional(),
  condition: z.enum(['NEW', 'CERTIFIED', 'USED']).optional(),
  // Los query params siempre llegan como string. `z.coerce.boolean()` aplica
  // la semántica de JS (Boolean("false") === true), así que "verified=false"
  // filtraba por verificados. Se comparan los literales explícitamente y
  // cualquier otro valor da 400 en lugar de colarse como `true`.
  verified: z
    .enum(['true', 'false'], {
      errorMap: () => ({ message: 'verified debe ser "true" o "false"' }),
    })
    .transform((v) => v === 'true')
    .optional(),
  minPrice: z.coerce.number().int().positive().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
})

export type CreatePhoneDto = z.infer<typeof createPhoneDto>
export type UpdatePhoneDto = z.infer<typeof updatePhoneDto>
export type PhonesQueryDto = z.infer<typeof phonesQueryDto>
