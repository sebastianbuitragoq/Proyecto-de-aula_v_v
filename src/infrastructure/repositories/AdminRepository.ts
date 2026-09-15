import { Prisma } from '@prisma/client'
import prisma from '../database/prisma'
import { AppError } from '../../domain/AppError'
import type { AlertType, StockAlert } from '../../domain/entities/Alert'
import type {
  AdminStats,
  AdminUser,
  IAdminRepository,
} from '../../domain/repositories/IAdminRepository'

// Prisma tira P2025 cuando el update no encuentra la fila. Si no se traduce,
// el error sube crudo y sale como 500 en vez del 404 que corresponde.
function usuarioNoExiste(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  )
}

function mapUser(raw: {
  id: string
  email: string
  name: string
  role: string
  banned: boolean
  banReason: string | null
  bannedAt: Date | null
  createdAt: Date
  updatedAt: Date
  _count?: { orders: number }
}): AdminUser {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role: raw.role as 'USER' | 'ADMIN',
    banned: raw.banned,
    banReason: raw.banReason,
    bannedAt: raw.bannedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    orderCount: raw._count?.orders ?? 0,
  }
}

export class AdminRepository implements IAdminRepository {
  async getStats(): Promise<AdminStats> {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // ─── Batch 1: conteos de usuarios y celulares (4 queries) ─────
    const [totalUsers, bannedUsers, newUsers, adminUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { banned: true } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
    ])

    const [totalPhones, inStockPhones, verifiedPhones] = await Promise.all([
      prisma.phone.count(),
      prisma.phone.count({ where: { stock: { gt: 0 } } }),
      prisma.phone.count({ where: { verified: true } }),
    ])

    // ─── Batch 2: estadísticas de órdenes (3 queries) ─────────────
    const [orderStats, revenueThisMonth, recentOrders] = await Promise.all([
      prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } },
        _sum: { total: true },
      }),
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { items: true } } },
      }),
    ])

    // ─── Revenue por día: 1 solo query + agrupación en JS ─────────
    // Antes: 7 queries simultáneos → ahora: 1 query
    const last7DaysOrders = await prisma.order.findMany({
      where: { createdAt: { gte: weekAgo }, status: { not: 'CANCELLED' } },
      select: { total: true, createdAt: true },
    })

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    const dailyRevenue = last7Days.map((day) => {
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)
      const dayOrders = last7DaysOrders.filter(
        (o) => o.createdAt >= day && o.createdAt < nextDay,
      )
      return {
        date: day.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
        amount: dayOrders.reduce((sum, o) => sum + o.total, 0),
        count: dayOrders.length,
      }
    })

    const statusMap = Object.fromEntries(
      orderStats.map((s) => [s.status, { count: s._count._all, sum: s._sum.total ?? 0 }]),
    )

    const totalRevenue = orderStats
      .filter((s) => s.status !== 'CANCELLED')
      .reduce((acc, s) => acc + (s._sum.total ?? 0), 0)

    return {
      users: {
        total: totalUsers,
        banned: bannedUsers,
        newThisWeek: newUsers,
        admins: adminUsers,
      },
      phones: {
        total: totalPhones,
        inStock: inStockPhones,
        outOfStock: totalPhones - inStockPhones,
        verified: verifiedPhones,
      },
      orders: {
        total: orderStats.reduce((a, s) => a + s._count._all, 0),
        pending: statusMap['PENDING']?.count ?? 0,
        confirmed: statusMap['CONFIRMED']?.count ?? 0,
        shipped: statusMap['SHIPPED']?.count ?? 0,
        delivered: statusMap['DELIVERED']?.count ?? 0,
        cancelled: statusMap['CANCELLED']?.count ?? 0,
        revenue: totalRevenue,
        revenueThisMonth: revenueThisMonth._sum.total ?? 0,
      },
      revenueByDay: dailyRevenue,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderRef: o.orderRef,
        email: o.email,
        name: o.name,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        itemCount: o._count.items,
      })),
    }
  }

  async listUsers(page: number, limit: number, search?: string) {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}
    const skip = (page - 1) * limit

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
    ])

    return {
      data: users.map(mapUser),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  // banUser() y unbanUser() eran el mismo bloque (update + include + manejo
  // de P2025) repetido con solo el `data` distinto. 42.9% de líneas
  // idénticas (hallazgo del documento de métricas) → un solo método privado.
  // changeRole() tampoco traducía el P2025 y respondía 500 en vez de 404
  // ante un id inexistente; ahora pasa por aquí y queda igual que los otros.
  private async actualizarUsuario(
    userId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<AdminUser> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data,
        include: { _count: { select: { orders: true } } },
      })
      return mapUser(user)
    } catch (error) {
      if (usuarioNoExiste(error))
        throw new AppError('Usuario no encontrado', 404)
      throw error
    }
  }

  async banUser(userId: string, reason: string): Promise<AdminUser> {
    return this.actualizarUsuario(userId, {
      banned: true,
      banReason: reason,
      bannedAt: new Date(),
    })
  }

  async unbanUser(userId: string): Promise<AdminUser> {
    return this.actualizarUsuario(userId, {
      banned: false,
      banReason: null,
      bannedAt: null,
    })
  }

  async changeRole(userId: string, role: 'USER' | 'ADMIN'): Promise<AdminUser> {
    return this.actualizarUsuario(userId, { role })
  }

  async listAlerts(): Promise<StockAlert[]> {
    const alerts = await prisma.alert.findMany({
      where: { isResolved: false },
      include: {
        phone: {
          select: {
            id: true,
            name: true,
            slug: true,
            stock: true,
            minStock: true,
            heroImage: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // En la base, `type` es un String: Postgres no tiene el enum y Prisma lo
    // devuelve sin estrechar. El dominio sí lo tiene tipado, así que se
    // afirma aquí, en el borde, y de ahí para adentro viaja como AlertType.
    return alerts.map((alert) => ({
      ...alert,
      type: alert.type as AlertType,
    }))
  }
}
