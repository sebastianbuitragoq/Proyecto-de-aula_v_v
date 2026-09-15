import { describe, expect, it } from 'vitest'
import {
  evaluarAlerta,
  mensajeAlerta,
} from '../../../src/domain/stock-alerts'
import { sincronizarAlertas } from '../../../src/infrastructure/repositories/stock-alerts'
import { prismaMock } from '../../helpers/prisma-mock'

/**
 * Alertas de inventario — regla de dominio y sincronización.
 *
 * evaluarAlerta() y mensajeAlerta() son funciones puras: se prueban con
 * valores directos. sincronizarAlertas() sí escribe, así que se comprueba
 * contra el doble de Prisma qué consultas emite en cada caso.
 */

// El tipo del doble no coincide con Prisma.TransactionClient (solo tiene los
// métodos que se usan), así que se pasa con un cast en el único punto donde
// hace falta, en vez de ensuciar la firma de producción.
const db = prismaMock as never

const CELULAR = {
  id: 'phone-1',
  name: 'iPhone 13',
  stock: 3,
  minStock: 5,
}

describe('evaluarAlerta — qué alerta corresponde a un inventario', () => {
  it('sin unidades → OUT_OF_STOCK', () => {
    expect(evaluarAlerta(0, 5)).toBe('OUT_OF_STOCK')
  })

  it('stock negativo (dato corrupto) también cuenta como agotado', () => {
    expect(evaluarAlerta(-2, 5)).toBe('OUT_OF_STOCK')
  })

  it('justo en el mínimo → LOW_STOCK (el umbral es inclusivo)', () => {
    expect(evaluarAlerta(5, 5)).toBe('LOW_STOCK')
  })

  it('por debajo del mínimo → LOW_STOCK', () => {
    expect(evaluarAlerta(1, 5)).toBe('LOW_STOCK')
  })

  it('por encima del mínimo → ninguna alerta', () => {
    expect(evaluarAlerta(6, 5)).toBeNull()
  })

  it('con mínimo en 0, una sola unidad ya es inventario sano', () => {
    expect(evaluarAlerta(1, 0)).toBeNull()
  })

  it('con mínimo en 0, quedarse en cero sigue siendo agotado', () => {
    expect(evaluarAlerta(0, 0)).toBe('OUT_OF_STOCK')
  })
})

describe('mensajeAlerta — texto que ve el administrador', () => {
  it('agotado: avisa que no quedan unidades', () => {
    expect(mensajeAlerta('OUT_OF_STOCK', 'iPhone 13', 0, 5)).toBe(
      '"iPhone 13" se quedó sin unidades.',
    )
  })

  it('poco stock: incluye cuántas quedan y cuál es el mínimo', () => {
    expect(mensajeAlerta('LOW_STOCK', 'iPhone 13', 3, 5)).toBe(
      '"iPhone 13" tiene 3 unidades, en o por debajo del mínimo de 5.',
    )
  })

  it('concuerda el singular cuando queda una sola unidad', () => {
    expect(mensajeAlerta('LOW_STOCK', 'Xiaomi 13', 1, 5)).toBe(
      '"Xiaomi 13" tiene 1 unidad, en o por debajo del mínimo de 5.',
    )
  })
})

describe('sincronizarAlertas — deja la tabla Alert al día', () => {
  it('inventario sano: cierra lo que hubiera abierto y no abre nada', async () => {
    await sincronizarAlertas(db, { ...CELULAR, stock: 20 })

    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: { phoneId: 'phone-1', isResolved: false },
      data: { isResolved: true },
    })
    expect(prismaMock.alert.upsert).not.toHaveBeenCalled()
  })

  it('poco stock: cierra las de otro tipo y abre (o reabre) la de LOW_STOCK', async () => {
    await sincronizarAlertas(db, CELULAR)

    // Solo se cierran las que NO son del tipo que toca; la de LOW_STOCK se
    // deja en pie para que el upsert la reutilice.
    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: {
        phoneId: 'phone-1',
        isResolved: false,
        type: { not: 'LOW_STOCK' },
      },
      data: { isResolved: true },
    })

    expect(prismaMock.alert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phoneId_type: { phoneId: 'phone-1', type: 'LOW_STOCK' } },
        create: expect.objectContaining({
          phoneId: 'phone-1',
          type: 'LOW_STOCK',
        }),
        update: expect.objectContaining({ isResolved: false }),
      }),
    )
  })

  it('agotado: abre la de OUT_OF_STOCK y cierra la de poco stock', async () => {
    await sincronizarAlertas(db, { ...CELULAR, stock: 0 })

    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: {
        phoneId: 'phone-1',
        isResolved: false,
        type: { not: 'OUT_OF_STOCK' },
      },
      data: { isResolved: true },
    })

    const [args] = prismaMock.alert.upsert.mock.calls[0] as [
      { create: { message: string }; update: { message: string } },
    ]
    expect(args.create.message).toContain('sin unidades')
  })

  it('el mensaje que se guarda es el que produce la regla de dominio', async () => {
    await sincronizarAlertas(db, CELULAR)

    const [args] = prismaMock.alert.upsert.mock.calls[0] as [
      { create: { message: string } },
    ]
    expect(args.create.message).toBe(
      mensajeAlerta('LOW_STOCK', 'iPhone 13', 3, 5),
    )
  })
})
