import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addFavorite,
  getMyFavorites,
  removeFavorite,
} from '../../../src/application/use-cases/favorites.use-cases'
import type { Phone } from '../../../src/domain/entities/Phone'
import type { IFavoriteRepository } from '../../../src/domain/repositories/IFavoriteRepository'
import type { IPhoneRepository } from '../../../src/domain/repositories/IPhoneRepository'

/**
 * Casos de uso de favoritos, aislados de Express y de Prisma.
 *
 * Aquí los repositorios se inyectan por parámetro, así que basta con pasar
 * dobles que cumplan la interfaz: no hace falta el doble del cliente Prisma
 * ni levantar la aplicación.
 */

const USER_ID = 'user-1'
const PHONE_ID = 'phone-1'

function dobleFavoritos(): IFavoriteRepository {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    findByUser: vi.fn(),
  }
}

function dobleCelulares(): IPhoneRepository {
  return {
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}

describe('addFavorite', () => {
  let favoritos: IFavoriteRepository
  let celulares: IPhoneRepository

  beforeEach(() => {
    favoritos = dobleFavoritos()
    celulares = dobleCelulares()
  })

  it('si el celular no existe → 404 y no se escribe nada', async () => {
    vi.mocked(celulares.findById).mockResolvedValue(null)

    await expect(
      addFavorite(favoritos, celulares, USER_ID, 'inexistente'),
    ).rejects.toMatchObject({
      message: 'Celular no encontrado',
      statusCode: 404,
    })

    expect(favoritos.add).not.toHaveBeenCalled()
  })

  it('si el celular existe, lo marca para ese usuario', async () => {
    vi.mocked(celulares.findById).mockResolvedValue({
      id: PHONE_ID,
    } as Phone)

    await addFavorite(favoritos, celulares, USER_ID, PHONE_ID)

    expect(favoritos.add).toHaveBeenCalledWith(USER_ID, PHONE_ID)
  })

  it('comprueba el catálogo antes de escribir, no después', async () => {
    const orden: string[] = []
    vi.mocked(celulares.findById).mockImplementation(async () => {
      orden.push('buscar celular')
      return { id: PHONE_ID } as Phone
    })
    vi.mocked(favoritos.add).mockImplementation(async () => {
      orden.push('marcar favorito')
    })

    await addFavorite(favoritos, celulares, USER_ID, PHONE_ID)

    expect(orden).toEqual(['buscar celular', 'marcar favorito'])
  })
})

describe('removeFavorite', () => {
  let favoritos: IFavoriteRepository

  beforeEach(() => {
    favoritos = dobleFavoritos()
  })

  it('pide quitar la marca de ese usuario y ese celular', async () => {
    await removeFavorite(favoritos, USER_ID, PHONE_ID)

    expect(favoritos.remove).toHaveBeenCalledWith(USER_ID, PHONE_ID)
  })

  it('no comprueba que el celular exista: quitar es idempotente por diseño', async () => {
    await expect(
      removeFavorite(favoritos, USER_ID, 'nunca-estuvo'),
    ).resolves.toBeUndefined()
  })
})

describe('getMyFavorites', () => {
  let favoritos: IFavoriteRepository

  beforeEach(() => {
    favoritos = dobleFavoritos()
  })

  it('consulta la lista del usuario que se le pasa', async () => {
    vi.mocked(favoritos.findByUser).mockResolvedValue([])

    await getMyFavorites(favoritos, USER_ID)

    expect(favoritos.findByUser).toHaveBeenCalledWith(USER_ID)
  })

  it('sin favoritos devuelve una lista vacía, no null', async () => {
    vi.mocked(favoritos.findByUser).mockResolvedValue([])

    await expect(getMyFavorites(favoritos, USER_ID)).resolves.toEqual([])
  })

  it('devuelve los celulares tal como los entrega el repositorio', async () => {
    const celulares = [
      { id: PHONE_ID, name: 'iPhone 13' },
      { id: 'phone-2', name: 'Galaxy S21' },
    ] as Phone[]
    vi.mocked(favoritos.findByUser).mockResolvedValue(celulares)

    await expect(getMyFavorites(favoritos, USER_ID)).resolves.toEqual(celulares)
  })
})
