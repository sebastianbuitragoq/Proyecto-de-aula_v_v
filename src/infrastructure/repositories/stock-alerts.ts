import type { Prisma } from '@prisma/client'
import { evaluarAlerta, mensajeAlerta } from '../../domain/stock-alerts'

/** Lo mínimo que hace falta de un celular para decidir su alerta. */
export interface InventarioCelular {
  id: string
  name: string
  stock: number
  minStock: number
}

/**
 * Deja las alertas de un celular en el estado que corresponde a su inventario.
 *
 * Es el único punto del proyecto que escribe en la tabla Alert. Tanto la
 * compra (OrderRepository) como la edición del catálogo (PhoneRepository)
 * pasan por aquí, así que no hay dos versiones de la regla que se puedan
 * desincronizar.
 *
 * Recibe el cliente como parámetro —no lo importa— para poder ejecutarse
 * dentro de la transacción de la compra: si el pedido se revierte, las
 * alertas que generó se revierten con él.
 */
export async function sincronizarAlertas(
  db: Prisma.TransactionClient,
  celular: InventarioCelular,
): Promise<void> {
  const tipo = evaluarAlerta(celular.stock, celular.minStock)

  // Cierra lo que ya no aplica. Cubre dos casos: se repuso inventario y no
  // queda ninguna alerta abierta, o se pasó de "poco stock" a "agotado" y hay
  // que cerrar la anterior antes de abrir la nueva.
  await db.alert.updateMany({
    where: {
      phoneId: celular.id,
      isResolved: false,
      ...(tipo ? { type: { not: tipo } } : {}),
    },
    data: { isResolved: true },
  })

  if (!tipo) return

  const message = mensajeAlerta(
    tipo,
    celular.name,
    celular.stock,
    celular.minStock,
  )

  // El unique (phoneId, type) hace que una segunda caída al mismo estado
  // reabra la fila que ya existe en vez de acumular duplicados. createdAt se
  // reescribe para que el panel ordene por "cuándo volvió a saltar".
  await db.alert.upsert({
    where: { phoneId_type: { phoneId: celular.id, type: tipo } },
    create: { phoneId: celular.id, type: tipo, message },
    update: { message, isResolved: false, createdAt: new Date() },
  })
}
