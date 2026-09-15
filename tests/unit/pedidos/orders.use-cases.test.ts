import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  createOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} from '../../../src/application/use-cases/orders.use-cases'
import { createOrderDto } from '../../../src/application/dtos/order.dto'
import type { CreateOrderDto } from '../../../src/application/dtos/order.dto'
import { OrderRepository } from '../../../src/infrastructure/repositories/OrderRepository'
import { prismaMock } from '../../helpers/prisma-mock'
import { ID_INEXISTENTE } from '../../helpers/fixtures'

// repo es el OrderRepository real: se ejercita su transacción completa (leer
// los precios vigentes, armar el snapshot de los items y descontar el stock
// con la condición `stock >= qty` dentro del WHERE). Lo único sustituido es
// el cliente Prisma, y el doble de $transaction ejecuta la función recibida
// pasándole el mismo doble como `tx`.
const repo = new OrderRepository()

const PHONE_ID_1 = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const PHONE_ID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function makeOrderData(
  items: CreateOrderDto['items'],
  overrides: Partial<CreateOrderDto> = {},
): CreateOrderDto {
  return {
    email: 'ana@test.com',
    name: 'Ana Garcia',
    phone: '+57 300 123 4567',
    address: 'Calle 123 #45-67',
    city: 'Bogota',
    dept: 'Cundinamarca',
    items,
    ...overrides,
  }
}

/** Fila reducida tal como la pide el select de la transacción. */
function filaCelular(id: string, price: number, stock: number, name = 'Celular') {
  return { id, name, price, heroImage: null, stock }
}

/**
 * Programa la transacción de compra.
 *
 * `celulares` son las filas que encuentra el findMany dentro de la
 * transacción; `stockSuficiente` decide si el updateMany afecta una fila (y
 * por tanto descuenta) o ninguna, que es como el motor señala que ya no
 * quedaba inventario.
 */
function programarCompra(
  celulares: ReturnType<typeof filaCelular>[],
  stockSuficiente = true,
) {
  prismaMock.phone.findMany.mockResolvedValue(celulares)
  prismaMock.phone.updateMany.mockResolvedValue({
    count: stockSuficiente ? 1 : 0,
  })
  prismaMock.order.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'pedido-1',
      ...data,
      status: 'CONFIRMED',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: (data.userId as string | undefined) ?? null,
      items: [],
    }),
  )
}

describe('createOrder', () => {
  it('crea el pedido calculando el subtotal y el total a partir del precio real de los celulares', async () => {
    programarCompra([
      filaCelular(PHONE_ID_1, 100_000, 10),
      filaCelular(PHONE_ID_2, 50_000, 10),
    ])
    const orderData = makeOrderData([
      { phoneId: PHONE_ID_1, qty: 2 },
      { phoneId: PHONE_ID_2, qty: 1, colorId: 'c1', colorName: 'Negro' },
    ])

    const result = await createOrder(repo, orderData, 'u1')

    // subtotal = 100.000×2 + 50.000×1 = 250.000. No pasa de 500.000, así que
    // el envío cuesta 20.000 (regla del repositorio).
    expect(result.subtotal).toBe(250_000)
    expect(result.shipping).toBe(20_000)
    expect(result.total).toBe(270_000)
    expect(result.userId).toBe('u1')
    expect(result.orderRef).toMatch(/^CP-[0-9A-F]{6}$/)
  })

  it('crea el pedido sin userId cuando la compra es de un invitado', async () => {
    programarCompra([filaCelular(PHONE_ID_1, 100_000, 5)])
    const orderData = makeOrderData([{ phoneId: PHONE_ID_1, qty: 1 }])

    const result = await createOrder(repo, orderData)

    expect(result.userId).toBeNull()
  })

  it('el envío es gratis cuando el subtotal supera los 500.000', async () => {
    programarCompra([filaCelular(PHONE_ID_1, 600_000, 5)])
    const orderData = makeOrderData([{ phoneId: PHONE_ID_1, qty: 1 }])

    const result = await createOrder(repo, orderData)

    expect(result.shipping).toBe(0)
    expect(result.total).toBe(600_000)
  })

  it('descuenta el stock del celular comprado', async () => {
    programarCompra([filaCelular(PHONE_ID_1, 100_000, 5)])
    const orderData = makeOrderData([{ phoneId: PHONE_ID_1, qty: 2 }])

    await createOrder(repo, orderData)

    // El descuento viaja en el mismo UPDATE que comprueba el inventario.
    expect(prismaMock.phone.updateMany).toHaveBeenCalledWith({
      where: { id: PHONE_ID_1, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    })
  })

  it('lanza AppError 404 si algún celular del pedido no existe', async () => {
    // El findMany no devuelve la fila: el id no está en el catálogo.
    programarCompra([])
    const orderData = makeOrderData([{ phoneId: ID_INEXISTENTE, qty: 1 }])

    await expect(createOrder(repo, orderData, 'u1')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prismaMock.order.create).not.toHaveBeenCalled()
  })

  it('lanza AppError 400 y no descuenta stock cuando el stock es insuficiente', async () => {
    // El UPDATE condicionado no encuentra fila con stock suficiente.
    programarCompra([filaCelular(PHONE_ID_1, 100_000, 1)], false)
    const orderData = makeOrderData([{ phoneId: PHONE_ID_1, qty: 5 }])

    await expect(createOrder(repo, orderData)).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

describe('createOrderDto validation', () => {
  const requiredFields = [
    'email',
    'name',
    'phone',
    'address',
    'city',
    'dept',
    'items',
  ] as const

  function datosCompletos(): CreateOrderDto {
    return makeOrderData([
      { phoneId: PHONE_ID_1, qty: 2 },
      { phoneId: PHONE_ID_2, qty: 1, colorId: 'c1', colorName: 'Negro' },
    ])
  }

  it.each(requiredFields)('rejects when "%s" is missing', (field) => {
    const data: Record<string, unknown> = datosCompletos()
    delete data[field]

    expect(() => createOrderDto.parse(data)).toThrow(z.ZodError)
  })

  it('accepts a complete order', () => {
    const parsed = createOrderDto.parse(datosCompletos())

    expect(parsed).toEqual(datosCompletos())
  })

  it('rejects an invalid email', () => {
    expect(() =>
      createOrderDto.parse(
        makeOrderData(datosCompletos().items, { email: 'not-an-email' }),
      ),
    ).toThrow(z.ZodError)
  })

  it('rejects an empty items array', () => {
    expect(() => createOrderDto.parse(makeOrderData([]))).toThrow(z.ZodError)
  })

  it('rejects a non-positive quantity', () => {
    const data = makeOrderData([{ phoneId: PHONE_ID_1, qty: 0 }])

    expect(() => createOrderDto.parse(data)).toThrow(z.ZodError)
  })

  it('rejects a non-uuid phoneId', () => {
    const data = makeOrderData([{ phoneId: 'p1', qty: 1 }])

    expect(() => createOrderDto.parse(data)).toThrow(z.ZodError)
  })
})

describe('getMyOrders', () => {
  it('returns all orders for the given user', async () => {
    const pedidos = [
      { id: 'p1', userId: 'u1', status: 'CONFIRMED', items: [] },
      { id: 'p2', userId: 'u1', status: 'CONFIRMED', items: [] },
    ]
    prismaMock.order.findMany.mockResolvedValue(pedidos)

    const result = await getMyOrders(repo, 'u1')

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    )
    expect(result).toHaveLength(2)
    expect(result.every((o) => o.userId === 'u1')).toBe(true)
  })

  it('returns an empty array when the user has no orders', async () => {
    prismaMock.order.findMany.mockResolvedValue([])

    const result = await getMyOrders(repo, 'usuario-sin-pedidos')

    expect(result).toEqual([])
  })
})

describe('getAllOrders', () => {
  it('returns a paginated list of orders', async () => {
    prismaMock.order.count.mockResolvedValue(3)
    prismaMock.order.findMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', status: 'CONFIRMED', items: [] },
      { id: 'p2', userId: 'u2', status: 'CONFIRMED', items: [] },
    ])

    const result = await getAllOrders(repo, 1, 2)

    expect(result.data).toHaveLength(2)
    expect(result.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 })
  })
})

describe('updateOrderStatus', () => {
  // OrderRepository.create() no fija el status: usa el valor por defecto del
  // schema, que es CONFIRMED. Por eso las transiciones válidas que se
  // prueban aquí parten de CONFIRMED (→ SHIPPED o CANCELLED), no de PENDING.
  function pedidoConfirmado() {
    return { id: 'pedido-1', userId: 'u1', status: 'CONFIRMED', items: [] }
  }

  it('actualiza el estado de un pedido existente (CONFIRMED → SHIPPED es una transición válida)', async () => {
    const order = pedidoConfirmado()
    prismaMock.order.findUnique.mockResolvedValue(order)
    prismaMock.order.update.mockResolvedValue({ ...order, status: 'SHIPPED' })

    const result = await updateOrderStatus(repo, order.id, 'SHIPPED')

    expect(result.status).toBe('SHIPPED')
  })

  it('rejects with 400 una transición inválida (de CONFIRMED a DELIVERED, saltándose SHIPPED)', async () => {
    const order = pedidoConfirmado()
    prismaMock.order.findUnique.mockResolvedValue(order)

    await expect(
      updateOrderStatus(repo, order.id, 'DELIVERED'),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it('rejects with 400 cuando el pedido ya está en ese estado', async () => {
    const order = pedidoConfirmado()
    prismaMock.order.findUnique.mockResolvedValue(order)

    await expect(
      updateOrderStatus(repo, order.id, 'CONFIRMED'),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it('rejects with 404 cuando el pedido no existe', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null)

    await expect(
      updateOrderStatus(repo, ID_INEXISTENTE, 'DELIVERED'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
