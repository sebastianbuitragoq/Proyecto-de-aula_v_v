import type { Phone } from '../../domain/entities/Phone'
import type { IFavoriteRepository } from '../../domain/repositories/IFavoriteRepository'
import prisma from '../database/prisma'
import { mapToPhone, phoneInclude } from './phone-mapper'

export class FavoriteRepository implements IFavoriteRepository {
  /**
   * Marcar dos veces el mismo celular no debe crear una segunda fila ni
   * reventar contra el unique (userId, phoneId). El upsert resuelve ambos
   * casos: si ya existe la deja como está, y si no, la crea.
   */
  async add(userId: string, phoneId: string): Promise<void> {
    await prisma.favorite.upsert({
      where: { userId_phoneId: { userId, phoneId } },
      update: {},
      create: { userId, phoneId },
    })
  }

  /**
   * deleteMany en lugar de delete: delete lanza P2025 si la fila no está, y
   * quitar de favoritos algo que nunca se marcó no es un error, es un no-op.
   */
  async remove(userId: string, phoneId: string): Promise<void> {
    await prisma.favorite.deleteMany({ where: { userId, phoneId } })
  }

  async findByUser(userId: string): Promise<Phone[]> {
    const favoritos = await prisma.favorite.findMany({
      where: { userId },
      include: { phone: { include: phoneInclude } },
      orderBy: { createdAt: 'desc' },
    })

    // Se devuelve el celular completo con el mismo mapeo que usa el catálogo,
    // para que el front reciba exactamente la misma forma venga de donde venga.
    return favoritos.map((favorito) => mapToPhone(favorito.phone))
  }
}
