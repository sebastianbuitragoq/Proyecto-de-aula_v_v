import { Prisma } from '@prisma/client'
import type { Phone, PhoneListItem } from '../../domain/entities/Phone'
import type {
  IPhoneRepository,
  PaginatedPhones,
  PhoneFilters,
} from '../../domain/repositories/IPhoneRepository'
import prisma from '../database/prisma'
import {
  mapToPhone,
  phoneInclude,
  type PhoneWithRelations,
} from './phone-mapper'
import { sincronizarAlertas } from './stock-alerts'

function buildWhere(filters: PhoneFilters): Prisma.PhoneWhereInput {
  const where: Prisma.PhoneWhereInput = {}

  if (filters.category) where.categoryId = filters.category
  if (filters.brand)
    where.brand = { equals: filters.brand, mode: 'insensitive' }
  if (filters.condition)
    where.condition = filters.condition as Prisma.EnumConditionFilter
  if (filters.verified !== undefined) where.verified = filters.verified
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.price = {}
    if (filters.minPrice !== undefined) where.price.gte = filters.minPrice
    if (filters.maxPrice !== undefined) where.price.lte = filters.maxPrice
  }
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { brand: { contains: filters.search, mode: 'insensitive' } },
      { shortDesc: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  return where
}

export class PhoneRepository implements IPhoneRepository {
  /**
   * Traduce la fila y deja sus alertas al día.
   *
   * create() y update() son los dos puntos donde un administrador cambia el
   * inventario a mano (dar de alta un modelo agotado, reponer unidades o
   * mover el umbral), así que ambos tienen que reevaluar la alerta. La compra
   * lo hace por su cuenta dentro de su transacción.
   */
  private async mapearYSincronizar(raw: PhoneWithRelations): Promise<Phone> {
    const phone = mapToPhone(raw)
    await sincronizarAlertas(prisma, {
      id: phone.id,
      name: phone.name,
      stock: phone.stock,
      minStock: phone.minStock,
    })
    return phone
  }

  async findAll(
    filters: PhoneFilters,
    page: number,
    limit: number,
  ): Promise<PaginatedPhones> {
    const where = buildWhere(filters)
    const skip = (page - 1) * limit

    const [total, phones] = await Promise.all([
      prisma.phone.count({ where }),
      prisma.phone.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          price: true,
          compareAt: true,
          badge: true,
          stock: true,
          condition: true,
          verified: true,
          batteryHealth: true,
          storage: true,
          ram: true,
          shortDesc: true,
          heroImage: true,
          category: { select: { name: true } },
        },
      }),
    ])

    const data: PhoneListItem[] = phones.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      price: p.price,
      compareAt: p.compareAt,
      badge: p.badge,
      stock: p.stock,
      condition: p.condition as Phone['condition'],
      verified: p.verified,
      batteryHealth: p.batteryHealth,
      storage: p.storage,
      ram: p.ram,
      shortDesc: p.shortDesc,
      heroImage: p.heroImage,
      category: p.category.name,
    }))

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async findBySlug(slug: string): Promise<Phone | null> {
    const phone = await prisma.phone.findUnique({
      where: { slug },
      include: phoneInclude,
    })
    return phone ? mapToPhone(phone) : null
  }

  async findById(id: string): Promise<Phone | null> {
    const phone = await prisma.phone.findUnique({
      where: { id },
      include: phoneInclude,
    })
    return phone ? mapToPhone(phone) : null
  }

  async create(
    data: Omit<Phone, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Phone> {
    const { images, colors, features, ...rest } = data
    const phone = await prisma.phone.create({
      data: {
        ...rest,
        images: { create: images },
        colors: {
          create: colors.map((c) => ({
            colorId: c.colorId,
            name: c.name,
            hex: c.hex,
          })),
        },
        features: {
          create: features.map((feature, position) => ({
            feature,
            position,
          })),
        },
      },
      include: phoneInclude,
    })
    return this.mapearYSincronizar(phone)
  }

  async update(
    id: string,
    data: Partial<Omit<Phone, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Phone> {
    const { images, colors, features, ...rest } = data
    const phone = await prisma.phone.update({
      where: { id },
      data: {
        ...rest,
        ...(images !== undefined && {
          images: { deleteMany: {}, create: images },
        }),
        ...(colors !== undefined && {
          colors: {
            deleteMany: {},
            create: colors.map((c) => ({
              colorId: c.colorId,
              name: c.name,
              hex: c.hex,
            })),
          },
        }),
        ...(features !== undefined && {
          features: {
            deleteMany: {},
            create: features.map((feature, position) => ({
              feature,
              position,
            })),
          },
        }),
      },
      include: phoneInclude,
    })
    return this.mapearYSincronizar(phone)
  }

  async delete(id: string): Promise<void> {
    await prisma.phone.delete({ where: { id } })
  }
}
