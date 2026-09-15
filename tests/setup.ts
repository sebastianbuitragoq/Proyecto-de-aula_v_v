import { beforeEach, vi } from 'vitest'

/**
 * Intercepta el cliente Prisma antes de que cualquier repositorio lo importe.
 *
 * La fábrica es asíncrona a propósito: el import ocurre cuando el módulo se
 * pide de verdad, así que no hay problemas de orden con el hoisting de vi.mock.
 */
vi.mock('../src/infrastructure/database/prisma', async () => {
  const { prismaMock } = await import('./helpers/prisma-mock')
  return { default: prismaMock }
})

/**
 * bcrypt es un módulo nativo: se compila para el sistema operativo donde se
 * instaló, así que la suite no correría en otra máquina ni en un pipeline de
 * integración continua. Se reemplaza por un doble con la misma semántica:
 * hash() transforma y compare() verifica contra esa transformación.
 */
vi.mock('bcrypt', () => {
  const hash = async (texto: string) => `hash:${texto}`
  const compare = async (texto: string, hasheado: string) =>
    hasheado === `hash:${texto}`
  return { default: { hash, compare }, hash, compare }
})

// Cada prueba arranca con el doble en blanco, para que lo programado en una
// no se filtre a la siguiente.
beforeEach(async () => {
  const { limpiarPrismaMock } = await import('./helpers/prisma-mock')
  limpiarPrismaMock()
})
