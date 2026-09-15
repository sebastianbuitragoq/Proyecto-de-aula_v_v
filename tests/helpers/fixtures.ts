import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { prismaMock } from './prisma-mock'

/**
 * Fixtures para la suite con dobles de prueba.
 *
 * Nada de esto toca la base de datos: cada función arma la fila tal como la
 * devolvería Prisma, y el test la usa para programar el doble
 * (mockResolvedValue) según el camino que quiera forzar.
 *
 * Las contraseñas usan el formato del doble de bcrypt que instala
 * tests/setup.ts ("hash:<texto>"), así que compare() sigue funcionando.
 */

/** Id con formato UUID que nunca existe: útil para probar los caminos de 404. */
export const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

type Rol = 'USER' | 'ADMIN'

export interface FilaUsuario {
  id: string
  email: string
  name: string
  password: string
  role: Rol
  banned: boolean
  banReason: string | null
  bannedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface OpcionesUsuario {
  id?: string
  email?: string
  name?: string
  password?: string
  role?: Rol
  banned?: boolean
  banReason?: string | null
}

/** Arma la fila de un usuario, igual a como la devolvería prisma.user. */
export function usuario(opciones: OpcionesUsuario = {}): FilaUsuario {
  const ahora = new Date()
  const {
    id = randomUUID(),
    email = `usuario-${id.slice(0, 8)}@correo.com`,
    name = 'Usuario de prueba',
    password = 'password123',
    role = 'USER',
    banned = false,
    banReason = null,
  } = { ...opciones, id: opciones.id ?? randomUUID() }

  return {
    id,
    email,
    name,
    password: `hash:${password}`,
    role,
    banned,
    banReason,
    bannedAt: banned ? ahora : null,
    createdAt: ahora,
    updatedAt: ahora,
  }
}

/** La misma fila pero como la devuelven las consultas del panel, con el conteo de pedidos. */
export function usuarioConConteo(
  opciones: OpcionesUsuario & { orders?: number } = {},
) {
  const { orders = 0, ...resto } = opciones
  return { ...usuario(resto), _count: { orders } }
}

/** Firma un JWT real, igual que signToken() en auth.use-cases.ts. */
export function generarToken(user: { id: string; role: string }): string {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  )
}

/** Token con una firma que no corresponde al JWT_SECRET del servidor. */
export function tokenConFirmaInvalida(): string {
  return jwt.sign({ id: ID_INEXISTENTE, role: 'ADMIN' }, 'secreto-equivocado')
}

/** Token ya vencido, firmado con el secreto correcto. */
export function tokenExpirado(user: { id: string; role: string }): string {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '-1h' },
  )
}

/**
 * Deja listo un usuario autenticado.
 *
 * auth.middleware ya no confía en el payload del token: en cada request
 * consulta la fila vigente para saber si está baneada y con qué rol. Por eso
 * la fixture además programa ese findUnique; si no, toda petición autenticada
 * respondería 401 aunque el token fuera válido.
 */
export function autenticar(opciones: OpcionesUsuario = {}) {
  const user = usuario(opciones)
  prismaMock.user.findUnique.mockResolvedValue(user)
  return { user, token: generarToken(user) }
}

/** Admin autenticado y ya registrado en el doble. */
export function autenticarAdmin(opciones: OpcionesUsuario = {}) {
  return autenticar({ ...opciones, role: 'ADMIN' })
}

interface OpcionesCelular {
  id?: string
  slug?: string
  name?: string
  brand?: string
  categoryId?: string
  price?: number
  stock?: number
  minStock?: number
  condition?: 'NEW' | 'CERTIFIED' | 'USED'
  verified?: boolean
}

/** Arma la fila de un celular con sus relaciones, como la devuelve phoneInclude. */
export function celular(opciones: OpcionesCelular = {}) {
  const ahora = new Date()
  const id = opciones.id ?? randomUUID()
  const {
    slug = `celular-${id.slice(0, 8)}`,
    name = 'Celular de prueba',
    brand = 'Apple',
    categoryId = 'apple',
    price = 1_500_000,
    stock = 5,
    minStock = 2,
    condition = 'CERTIFIED',
    verified = true,
  } = opciones

  return {
    id,
    slug,
    name,
    brand,
    categoryId,
    price,
    compareAt: null,
    badge: null,
    stock,
    minStock,
    condition,
    verified,
    batteryHealth: null,
    ram: null,
    storage: null,
    camera: null,
    battery: null,
    screen: null,
    chip: null,
    shortDesc: null,
    longDesc: null,
    heroImage: null,
    createdAt: ahora,
    updatedAt: ahora,
    images: [],
    colors: [],
    features: [],
    category: { name: categoryId },
  }
}

/** Body mínimo que aprueba createPhoneDto, para ESC-30. */
export function bodyCelularValido(cambios: Record<string, unknown> = {}) {
  return {
    slug: `celular-nuevo-${randomUUID().slice(0, 8)}`,
    name: 'Celular nuevo de prueba',
    brand: 'Samsung',
    categoryId: 'samsung',
    price: 1_500_000,
    stock: 3,
    condition: 'CERTIFIED',
    ...cambios,
  }
}

/**
 * Fila de la tabla Favorite con su celular incluido, como la devuelve
 * findByUser() antes de pasar por el mapeo al dominio.
 */
export function favorito(
  opciones: { userId?: string; celular?: ReturnType<typeof celular> } = {},
) {
  const { userId = randomUUID(), celular: phone = celular() } = opciones

  return {
    id: randomUUID(),
    userId,
    phoneId: phone.id,
    createdAt: new Date(),
    phone,
  }
}

interface OpcionesAlerta {
  id?: string
  phoneId?: string
  type?: 'LOW_STOCK' | 'OUT_OF_STOCK'
  message?: string
  isResolved?: boolean
  nombreCelular?: string
  stock?: number
  minStock?: number
}

/** Fila de la tabla Alert con su celular incluido, como la devuelve listAlerts(). */
export function alerta(opciones: OpcionesAlerta = {}) {
  const {
    id = randomUUID(),
    phoneId = randomUUID(),
    type = 'LOW_STOCK',
    message = 'Quedan pocas unidades.',
    isResolved = false,
    nombreCelular = 'Celular de prueba',
    stock = 2,
    minStock = 5,
  } = opciones

  return {
    id,
    phoneId,
    type,
    message,
    isResolved,
    createdAt: new Date(),
    phone: {
      id: phoneId,
      name: nombreCelular,
      slug: `celular-${phoneId.slice(0, 8)}`,
      stock,
      minStock,
      heroImage: null,
    },
  }
}

/**
 * Error de Prisma cuando un update/delete no encuentra la fila.
 *
 * Tiene que ser la clase real: AdminRepository.usuarioNoExiste() comprueba
 * `error instanceof Prisma.PrismaClientKnownRequestError`, así que un Error
 * corriente con la propiedad code no activaría el 404.
 */
export function errorRegistroNoEncontrado() {
  return new Prisma.PrismaClientKnownRequestError(
    'An operation failed because it depends on one or more records that were required but not found.',
    { code: 'P2025', clientVersion: '5.22.0' },
  )
}
