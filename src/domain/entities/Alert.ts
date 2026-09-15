/**
 * Alerta de inventario.
 *
 * LOW_STOCK    el celular llegó al umbral de reposición (minStock) pero
 *              todavía quedan unidades disponibles.
 * OUT_OF_STOCK el celular se quedó en cero.
 */
export type AlertType = 'LOW_STOCK' | 'OUT_OF_STOCK'

/** Datos del celular que acompañan a la alerta en el panel de administración. */
export interface AlertPhone {
  id: string
  name: string
  slug: string
  stock: number
  minStock: number
  heroImage: string | null
}

export interface StockAlert {
  id: string
  phoneId: string
  type: AlertType
  message: string
  isResolved: boolean
  createdAt: Date
  phone: AlertPhone
}
