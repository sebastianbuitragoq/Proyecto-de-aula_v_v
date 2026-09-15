import { NextFunction, Request, Response } from 'express'
import {
  addFavorite,
  getMyFavorites,
  removeFavorite,
} from '../../application/use-cases/favorites.use-cases'
import { FavoriteRepository } from '../../infrastructure/repositories/FavoriteRepository'
import { PhoneRepository } from '../../infrastructure/repositories/PhoneRepository'

const favoriteRepo = new FavoriteRepository()
const phoneRepo = new PhoneRepository()

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getMyFavorites(favoriteRepo, req.user!.id)
    res.json({ data })
  } catch (error) {
    next(error)
  }
}

export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneId } = req.params
    await addFavorite(favoriteRepo, phoneRepo, req.user!.id, phoneId)
    res.status(201).json({ data: { phoneId, favorited: true } })
  } catch (error) {
    next(error)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await removeFavorite(favoriteRepo, req.user!.id, req.params.phoneId)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
}
