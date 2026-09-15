/** Marca de que un usuario guardó un celular en su lista de favoritos. */
export interface Favorite {
  id: string
  userId: string
  phoneId: string
  createdAt: Date
}
