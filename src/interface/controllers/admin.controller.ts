import { NextFunction, Request, Response } from 'express'
import { AdminRepository } from '../../infrastructure/repositories/AdminRepository'
import {
  banUser,
  changeUserRole,
  getStats,
  listStockAlerts,
  listUsers,
  unbanUser,
} from '../../application/use-cases/admin.use-cases'
import { adminUsersQueryDto } from '../../application/dtos/admin.dto'

const repo = new AdminRepository()

export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getStats(repo)
    res.json({ data })
  } catch (error) {
    next(error)
  }
}

export async function users(req: Request, res: Response, next: NextFunction) {
  try {
    const query = adminUsersQueryDto.parse(req.query)
    const result = await listUsers(repo, query.page, query.limit, query.search)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function alerts(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listStockAlerts(repo)
    res.json({ data })
  } catch (error) {
    next(error)
  }
}

export async function ban(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await banUser(repo, req.params.id, req.body, req.user!.id)
    res.json({ data: user })
  } catch (error) {
    next(error)
  }
}

export async function unban(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await unbanUser(repo, req.params.id)
    res.json({ data: user })
  } catch (error) {
    next(error)
  }
}

export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await changeUserRole(
      repo,
      req.params.id,
      req.body,
      req.user!.id,
    )
    res.json({ data: user })
  } catch (error) {
    next(error)
  }
}
