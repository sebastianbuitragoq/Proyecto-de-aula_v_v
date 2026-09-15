import type { StockAlert } from '../entities/Alert'
import type { PublicUser } from '../entities/User'

export interface AdminStats {
  users: {
    total: number
    banned: number
    newThisWeek: number
    admins: number
  }
  phones: {
    total: number
    inStock: number
    outOfStock: number
    verified: number
  }
  orders: {
    total: number
    pending: number
    confirmed: number
    shipped: number
    delivered: number
    cancelled: number
    revenue: number
    revenueThisMonth: number
  }
  revenueByDay: Array<{ date: string; amount: number; count: number }>
  recentOrders: Array<{
    id: string
    orderRef: string
    email: string
    name: string
    total: number
    status: string
    createdAt: Date
    itemCount: number
  }>
}

export interface AdminUser extends PublicUser {
  banned: boolean
  banReason: string | null
  bannedAt: Date | null
  orderCount: number
}

export interface IAdminRepository {
  getStats(): Promise<AdminStats>
  listUsers(page: number, limit: number, search?: string): Promise<{
    data: AdminUser[]
    meta: { total: number; page: number; limit: number; totalPages: number }
  }>
  banUser(userId: string, reason: string): Promise<AdminUser>
  unbanUser(userId: string): Promise<AdminUser>
  changeRole(userId: string, role: 'USER' | 'ADMIN'): Promise<AdminUser>
  /** Alertas de inventario todavía sin resolver, de la más reciente a la más antigua. */
  listAlerts(): Promise<StockAlert[]>
}
