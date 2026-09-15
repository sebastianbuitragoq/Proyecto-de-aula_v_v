import type { AlertType } from './entities/Alert'

/**
 * Reglas de negocio de las alertas de inventario.
 *
 * Viven en el dominio y no tocan Prisma: son funciones puras, así que la
 * misma regla se aplica venga el cambio de stock de una compra o de una
 * edición del catálogo, y se puede probar sin levantar nada.
 */

/**
 * Decide qué alerta corresponde a un celular según su inventario.
 *
 * El umbral es inclusivo: con minStock = 5, cinco unidades ya son motivo de
 * alerta. La idea es avisar *al llegar* al mínimo, no después de pasarlo.
 *
 * @returns el tipo de alerta que debe estar abierta, o null si el inventario
 *          está sano y no corresponde ninguna.
 */
export function evaluarAlerta(
  stock: number,
  minStock: number,
): AlertType | null {
  if (stock <= 0) return 'OUT_OF_STOCK'
  if (stock <= minStock) return 'LOW_STOCK'
  return null
}

/** Texto que verá el administrador en el panel. */
export function mensajeAlerta(
  tipo: AlertType,
  nombre: string,
  stock: number,
  minStock: number,
): string {
  if (tipo === 'OUT_OF_STOCK') {
    return `"${nombre}" se quedó sin unidades.`
  }
  return `"${nombre}" tiene ${stock} ${
    stock === 1 ? 'unidad' : 'unidades'
  }, en o por debajo del mínimo de ${minStock}.`
}
