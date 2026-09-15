import { AppError } from '../../domain/AppError'
import type { IAdminRepository } from '../../domain/repositories/IAdminRepository'
import type { BanUserDto, ChangeRoleDto } from '../dtos/admin.dto'

// banUser() y changeUserRole() repetían el mismo guardado "no puedes
// actuar sobre tu propia cuenta", solo cambiaba el mensaje.
function assertNotSelf(userId: string, requesterId: string, message: string) {
  if (userId === requesterId) throw new AppError(message, 400)
}

export async function getStats(repo: IAdminRepository) {
  return repo.getStats()
}

export async function listUsers(
  repo: IAdminRepository,
  page: number,
  limit: number,
  search?: string,
) {
  return repo.listUsers(page, limit, search)
}

export async function banUser(
  repo: IAdminRepository,
  userId: string,
  data: BanUserDto,
  requesterId: string,
) {
  assertNotSelf(userId, requesterId, 'No puedes banear tu propia cuenta')
  return repo.banUser(userId, data.reason)
}

export async function unbanUser(repo: IAdminRepository, userId: string) {
  return repo.unbanUser(userId)
}

export async function listStockAlerts(repo: IAdminRepository) {
  return repo.listAlerts()
}

export async function changeUserRole(
  repo: IAdminRepository,
  userId: string,
  data: ChangeRoleDto,
  requesterId: string,
) {
  assertNotSelf(userId, requesterId, 'No puedes cambiar tu propio rol')
  return repo.changeRole(userId, data.role)
}
