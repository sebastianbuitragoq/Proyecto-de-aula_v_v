import type { IFavoriteRepository } from '../../domain/repositories/IFavoriteRepository'
import type { IPhoneRepository } from '../../domain/repositories/IPhoneRepository'
import { findPhoneByIdOrThrow } from './phones.use-cases'

/**
 * Marca un celular como favorito.
 *
 * Se confirma que el celular exista antes de escribir nada: si no, la fila
 * quedaría apuntando a un id que la clave foránea va a rechazar, y el usuario
 * vería un 500 en vez del 404 que le corresponde.
 */
export async function addFavorite(
  favoriteRepo: IFavoriteRepository,
  phoneRepo: IPhoneRepository,
  userId: string,
  phoneId: string,
): Promise<void> {
  await findPhoneByIdOrThrow(phoneRepo, phoneId)
  await favoriteRepo.add(userId, phoneId)
}

/**
 * Quita un celular de la lista.
 *
 * A diferencia de agregar, aquí no se comprueba que el celular exista: si ya
 * no está en el catálogo, la fila tampoco está (la relación borra en
 * cascada), y el resultado que pide el cliente —que no quede marcado— ya se
 * cumple. Devolver 404 obligaría al front a distinguir dos casos que para él
 * son el mismo.
 */
export async function removeFavorite(
  repo: IFavoriteRepository,
  userId: string,
  phoneId: string,
): Promise<void> {
  await repo.remove(userId, phoneId)
}

export async function getMyFavorites(
  repo: IFavoriteRepository,
  userId: string,
) {
  return repo.findByUser(userId)
}
