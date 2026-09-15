import { AppError } from '../../domain/AppError'
import type { Phone } from '../../domain/entities/Phone'
import type {
  IPhoneRepository,
  PhoneFilters,
} from '../../domain/repositories/IPhoneRepository'
import type {
  CreatePhoneDto,
  PhonesQueryDto,
  UpdatePhoneDto,
} from '../dtos/phone.dto'

export async function getPhones(
  repo: IPhoneRepository,
  query: PhonesQueryDto,
) {
  const filters: PhoneFilters = {
    category: query.category,
    brand: query.brand,
    condition: query.condition,
    verified: query.verified,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    search: query.search,
  }
  return repo.findAll(filters, query.page, query.limit)
}

// findById() + el 404 se repetía igual en getPhoneById, updatePhone y
// deletePhone. Se exporta porque favoritos necesita la misma guarda antes de
// marcar un celular, y no tiene sentido tener dos versiones del mismo 404.
export async function findPhoneByIdOrThrow(
  repo: IPhoneRepository,
  id: string,
) {
  const phone = await repo.findById(id)
  if (!phone) throw new AppError('Celular no encontrado', 404)
  return phone
}

export async function getPhoneBySlug(repo: IPhoneRepository, slug: string) {
  const phone = await repo.findBySlug(slug)
  if (!phone) throw new AppError('Celular no encontrado', 404)
  return phone
}

export async function getPhoneById(repo: IPhoneRepository, id: string) {
  return findPhoneByIdOrThrow(repo, id)
}

export async function createPhone(
  repo: IPhoneRepository,
  data: CreatePhoneDto,
): Promise<Phone> {
  const existe = await repo.findBySlug(data.slug)
  if (existe) throw new AppError('Ya existe un celular con ese slug', 409)
  return repo.create({
    ...data,
    compareAt: data.compareAt ?? null,
    badge: data.badge ?? null,
    batteryHealth: data.batteryHealth ?? null,
    ram: data.ram ?? null,
    storage: data.storage ?? null,
    camera: data.camera ?? null,
    battery: data.battery ?? null,
    screen: data.screen ?? null,
    chip: data.chip ?? null,
    shortDesc: data.shortDesc ?? null,
    longDesc: data.longDesc ?? null,
    heroImage: data.heroImage ?? null,
  })
}

export async function updatePhone(
  repo: IPhoneRepository,
  id: string,
  data: UpdatePhoneDto,
): Promise<Phone> {
  await findPhoneByIdOrThrow(repo, id)
  return repo.update(id, data)
}

export async function deletePhone(
  repo: IPhoneRepository,
  id: string,
): Promise<void> {
  await findPhoneByIdOrThrow(repo, id)
  return repo.delete(id)
}
