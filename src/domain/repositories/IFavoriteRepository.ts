import type { Phone } from '../entities/Phone'

export interface IFavoriteRepository {
  /** Marca el celular como favorito. Si ya lo estaba, no cambia nada. */
  add(userId: string, phoneId: string): Promise<void>
  /** Quita la marca. Si no estaba, tampoco falla. */
  remove(userId: string, phoneId: string): Promise<void>
  /** Celulares favoritos del usuario, del más reciente al más antiguo. */
  findByUser(userId: string): Promise<Phone[]>
}
