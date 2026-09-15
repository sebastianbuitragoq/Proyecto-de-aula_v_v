import { Prisma } from '@prisma/client'
import type { Phone } from '../../domain/entities/Phone'

/**
 * Forma en que se lee un celular completo de la base y cómo se traduce al
 * dominio.
 *
 * Vive aparte del repositorio de celulares porque favoritos también devuelve
 * celulares completos: si cada repositorio armara su propio `include` y su
 * propio mapeo, el mismo celular saldría con distinta forma según el endpoint
 * por el que se pidiera.
 */
export const phoneInclude = {
  images: { orderBy: { position: 'asc' as const } },
  colors: true,
  features: { orderBy: { position: 'asc' as const } },
  category: { select: { name: true } },
} satisfies Prisma.PhoneInclude

export type PhoneWithRelations = Prisma.PhoneGetPayload<{
  include: typeof phoneInclude
}>

/**
 * Traduce la fila de Prisma a la entidad del dominio.
 *
 * No es un simple volcado: las características se guardan como filas con
 * posición y hacia afuera viajan como texto plano, que es lo que declara la
 * entidad Phone.
 */
export function mapToPhone(raw: PhoneWithRelations): Phone {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    brand: raw.brand,
    categoryId: raw.categoryId,
    price: raw.price,
    compareAt: raw.compareAt,
    badge: raw.badge,
    stock: raw.stock,
    minStock: raw.minStock,
    condition: raw.condition as Phone['condition'],
    verified: raw.verified,
    batteryHealth: raw.batteryHealth,
    ram: raw.ram,
    storage: raw.storage,
    camera: raw.camera,
    battery: raw.battery,
    screen: raw.screen,
    chip: raw.chip,
    shortDesc: raw.shortDesc,
    longDesc: raw.longDesc,
    heroImage: raw.heroImage,
    images: raw.images.map((img) => ({
      id: img.id,
      url: img.url,
      position: img.position,
    })),
    colors: raw.colors.map((c) => ({
      id: c.id,
      colorId: c.colorId,
      name: c.name,
      hex: c.hex,
    })),
    features: raw.features.map((f) => f.feature),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}
