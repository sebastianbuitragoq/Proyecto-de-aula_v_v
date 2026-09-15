import crypto from 'crypto'
import type { Order, OrderStatus } from '../../domain/entities/Order'
import type {
  CreateOrderData,
  IOrderRepository,
  PaginatedOrders,
} from '../../domain/repositories/IOrderRepository'
import { AppError } from '../../domain/AppError'
import prisma from '../database/prisma'
import { sincronizarAlertas } from './stock-alerts'

function generateOrderRef(): string {
  return 'CP-' + crypto.randomBytes(3).toString('hex').toUpperCase()
}

function mapToOrder(raw: {
  id: string
  orderRef: string
  userId: string | null
  email: string
  name: string
  phone: string
  address: string
  city: string
  dept: string
  subtotal: number
  shipping: number
  total: number
  status: string
  createdAt: Date
  updatedAt: Date
  items: {
    id: number
    phoneId: string | null
    name: string
    heroImage: string | null
    price: number
    qty: number
    colorId: string | null
    colorName: string | null
  }[]
}): Order {
  return {
    ...raw,
    status: raw.status as OrderStatus,
  }
}

export class OrderRepository implements IOrderRepository {
  async create(data: CreateOrderData): Promise<Order> {
    const phoneIds = data.items.map((i) => i.phoneId)

    const order = await prisma.$transaction(async (tx) => {
      // Leer DENTRO de la transacción: el precio que se cobra y el nombre que
      // se guarda en el snapshot deben ser los mismos que se validan aquí.
      const phones = await tx.phone.findMany({
        where: { id: { in: phoneIds } },
        select: {
          id: true,
          name: true,
          price: true,
          heroImage: true,
          stock: true,
        },
      })

      const phoneMap = new Map(phones.map((p) => [p.id, p]))

      for (const item of data.items) {
        if (!phoneMap.has(item.phoneId))
          throw new AppError(`Celular ${item.phoneId} no encontrado`, 404)
      }

      const subtotal = data.items.reduce((sum, item) => {
        const phone = phoneMap.get(item.phoneId)!
        return sum + phone.price * item.qty
      }, 0)

      const shipping = subtotal > 500000 ? 0 : 20000
      const total = subtotal + shipping

      const newOrder = await tx.order.create({
        data: {
          orderRef: generateOrderRef(),
          userId: data.userId,
          email: data.email,
          name: data.name,
          phone: data.phone,
          address: data.address,
          city: data.city,
          dept: data.dept,
          subtotal,
          shipping,
          total,
          items: {
            create: data.items.map((item) => {
              const phone = phoneMap.get(item.phoneId)!
              return {
                phoneId: item.phoneId,
                name: phone.name,
                heroImage: phone.heroImage,
                price: phone.price,
                qty: item.qty,
                colorId: item.colorId ?? null,
                colorName: item.colorName ?? null,
              }
            }),
          },
        },
        include: { items: true },
      })

      // Descuento atómico. La condición `stock >= qty` viaja dentro del WHERE,
      // así que la valida el propio motor al aplicar el UPDATE, no nosotros
      // antes. Si dos compras simultáneas van por el último celular, la
      // segunda encuentra la fila ya descontada, afecta 0 filas y revierte
      // toda la transacción en lugar de sobrevender.
      for (const item of data.items) {
        const updated = await tx.phone.updateMany({
          where: { id: item.phoneId, stock: { gte: item.qty } },
          data: { stock: { decrement: item.qty } },
        })

        if (updated.count === 0) {
          const phone = phoneMap.get(item.phoneId)!
          throw new AppError(`Stock insuficiente para "${phone.name}"`, 400)
        }
      }

      // Alertas de inventario. Se relee el stock ya descontado en vez de
      // restarlo en memoria: con compras simultáneas el valor final no tiene
      // por qué ser `stock - qty`, y la alerta debe reflejar lo que quedó de
      // verdad. Va dentro de la transacción, así que si el pedido se revierte
      // las alertas que generó se revierten también.
      const inventario = await tx.phone.findMany({
        where: { id: { in: phoneIds } },
        select: { id: true, name: true, stock: true, minStock: true },
      })

      for (const celular of inventario) {
        await sincronizarAlertas(tx, celular)
      }

      return newOrder
    })

    return mapToOrder(order)
  }

  async findById(id: string): Promise<Order | null> {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    })
    return order ? mapToOrder(order) : null
  }

  async findByUser(userId: string): Promise<Order[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
    return orders.map(mapToOrder)
  }

  async findAll(page: number, limit: number): Promise<PaginatedOrders> {
    const skip = (page - 1) * limit
    const [total, orders] = await Promise.all([
      prisma.order.count(),
      prisma.order.findMany({
        skip,
        take: limit,
        include: {
          items: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return {
      data: orders.map(mapToOrder),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    })
    return mapToOrder(order)
  }
}
