import { vi } from 'vitest'

/**
 * Doble de prueba del cliente Prisma.
 *
 * Solo se reemplaza la capa que habla con la base de datos. Todo lo demás
 * (rutas, auth.middleware, validate.middleware, controladores, casos de uso
 * y repositorios) se ejecuta de verdad, que es justamente lo que recorren los
 * grafos de flujo. Así cada camino se puede forzar con exactitud y sin
 * necesitar Postgres encendido.
 *
 * Cada método es un vi.fn(): el test decide qué devuelve con
 * mockResolvedValue() / mockRejectedValue() según el camino que quiera forzar.
 */
function modelo<T extends string>(...metodos: T[]) {
  return Object.fromEntries(metodos.map((m) => [m, vi.fn()])) as Record<
    T,
    ReturnType<typeof vi.fn>
  >
}

export const prismaMock = {
  user: modelo(
    'count',
    'findMany',
    'findUnique',
    'create',
    'update',
    'upsert',
    'deleteMany',
  ),
  phone: modelo(
    'count',
    'findMany',
    'findUnique',
    'create',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
  ),
  order: modelo(
    'count',
    'groupBy',
    'aggregate',
    'findMany',
    'findUnique',
    'create',
    'update',
    'deleteMany',
  ),
  alert: modelo(
    'count',
    'findMany',
    'findUnique',
    'create',
    'update',
    'updateMany',
    'upsert',
    'deleteMany',
  ),
  favorite: modelo(
    'count',
    'findMany',
    'findUnique',
    'create',
    'upsert',
    'delete',
    'deleteMany',
  ),
  orderItem: modelo('deleteMany', 'createMany'),
  category: modelo('createMany', 'deleteMany'),
  phoneImage: modelo('deleteMany'),
  phoneColor: modelo('deleteMany'),
  phoneFeature: modelo('deleteMany'),

  // OrderRepository.create() envuelve todo en una transacción. El doble
  // ejecuta la función recibida pasándole el propio mock como cliente, así
  // que dentro de la transacción se usan los mismos vi.fn() de arriba y el
  // test puede programarlos igual que fuera de ella.
  $transaction: vi.fn(async (fn: unknown) => {
    if (typeof fn === 'function') {
      return (fn as (tx: typeof prismaMock) => unknown)(prismaMock)
    }
    // Forma prisma.$transaction([...promesas])
    return Promise.all(fn as unknown as Promise<unknown>[])
  }),

  $connect: vi.fn(),
  $disconnect: vi.fn(),
}

/** Deja todos los vi.fn() del doble sin implementación ni historial. */
export function limpiarPrismaMock(): void {
  for (const valor of Object.values(prismaMock)) {
    if (typeof valor === 'function') {
      // $transaction: se limpia el historial pero se conserva su comportamiento.
      continue
    }
    for (const metodo of Object.values(valor as Record<string, unknown>)) {
      ;(metodo as { mockReset: () => void }).mockReset()
    }
  }
  prismaMock.$transaction.mockClear()
  prismaMock.$connect.mockClear()
  prismaMock.$disconnect.mockClear()
}
