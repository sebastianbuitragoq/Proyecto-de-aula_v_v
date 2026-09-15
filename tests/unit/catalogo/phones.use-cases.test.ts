import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  createPhone,
  deletePhone,
  getPhoneById,
  getPhoneBySlug,
  getPhones,
  updatePhone,
} from '../../../src/application/use-cases/phones.use-cases';
import type {
  CreatePhoneDto,
  PhonesQueryDto,
  UpdatePhoneDto,
} from '../../../src/application/dtos/phone.dto';
import type {
  IPhoneRepository,
  PaginatedPhones,
  PhoneFilters,
} from '../../../src/domain/repositories/IPhoneRepository';
import type { Phone } from '../../../src/domain/entities/Phone';

// ─── Fábrica de teléfonos de prueba ─────────────────────────────
let contador = 0;

function makePhone(sobreescrituras: Partial<Phone> = {}): Phone {
  contador += 1;
  const ahora = new Date();
  return {
    id: `telefono-${contador}`,
    slug: `telefono-${contador}`,
    name: 'iPhone de prueba',
    brand: 'Apple',
    categoryId: 'apple',
    price: 1_500_000,
    compareAt: null,
    badge: null,
    stock: 5,
    minStock: 5,
    condition: 'CERTIFIED',
    verified: true,
    batteryHealth: null,
    ram: null,
    storage: '128GB',
    camera: null,
    battery: null,
    screen: null,
    chip: null,
    shortDesc: null,
    longDesc: null,
    heroImage: null,
    images: [],
    colors: [],
    features: [],
    createdAt: ahora,
    updatedAt: ahora,
    ...sobreescrituras,
  };
}

// ─── Repositorio simulado en memoria ────────────────────────────
class IPhoneRepositoryMock implements IPhoneRepository {
  private phones: Phone[];

  constructor(phones: Phone[] = []) {
    this.phones = phones;
  }

  // Implementación completa: busca por slug dentro del arreglo en memoria.
  async findBySlug(slug: string): Promise<Phone | null> {
    return this.phones.find((p) => p.slug === slug) ?? null;
  }

  // Implementación completa: aplica filtros y pagina el resultado.
  async findAll(
    filters: PhoneFilters,
    page: number,
    limit: number,
  ): Promise<PaginatedPhones> {
    const empieza = (page - 1) * limit;

    const coinciden = this.phones.filter((p) => {
      if (filters.category && p.categoryId !== filters.category) return false;
      if (filters.brand && p.brand !== filters.brand) return false;
      if (filters.condition && p.condition !== filters.condition) return false;
      if (filters.verified !== undefined && p.verified !== filters.verified)
        return false;
      if (filters.minPrice !== undefined && p.price < filters.minPrice)
        return false;
      if (filters.maxPrice !== undefined && p.price > filters.maxPrice)
        return false;
      if (filters.search) {
        const termino = filters.search.toLowerCase();
        return (
          p.name.toLowerCase().includes(termino) ||
          p.brand.toLowerCase().includes(termino) ||
          p.slug.toLowerCase().includes(termino)
        );
      }
      return true;
    });

    const data = coinciden.slice(empieza, empieza + limit).map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      price: p.price,
      compareAt: p.compareAt,
      badge: p.badge,
      stock: p.stock,
      condition: p.condition,
      verified: p.verified,
      batteryHealth: p.batteryHealth,
      storage: p.storage,
      ram: p.ram,
      shortDesc: p.shortDesc,
      heroImage: p.heroImage,
      category: p.categoryId,
    }));

    return {
      data,
      meta: {
        total: coinciden.length,
        page,
        limit,
        totalPages: Math.ceil(coinciden.length / limit),
      },
    };
  }

  // Implementación funcional: permiten probar los use-cases restantes.
  async findById(id: string): Promise<Phone | null> {
    return this.phones.find((p) => p.id === id) ?? null;
  }

  async create(
    data: Omit<Phone, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Phone> {
    const ahora = new Date();
    const phone: Phone = {
      ...data,
      id: `telefono-nuevo-${contador}`,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.phones.push(phone);
    return phone;
  }

  async update(
    id: string,
    data: Partial<Omit<Phone, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Phone> {
    const actual = this.phones.find((p) => p.id === id);
    if (!actual) throw new Error('Celular no encontrado');
    const actualizado: Phone = { ...actual, ...data, updatedAt: new Date() };
    this.phones[this.phones.indexOf(actual)] = actualizado;
    return actualizado;
  }

  async delete(id: string): Promise<void> {
    this.phones = this.phones.filter((p) => p.id !== id);
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getPhoneBySlug — obtener un celular por su slug', () => {
  it('returns the phone when the slug exists', async () => {
    const telefonos = [
      makePhone({ id: 'p1', slug: 'iphone-15', name: 'iPhone 15' }),
      makePhone({ id: 'p2', slug: 'galaxy-s24', name: 'Galaxy S24' }),
    ];
    const repo = new IPhoneRepositoryMock(telefonos);

    const result = await getPhoneBySlug(repo, 'iphone-15');

    expect(result).toEqual(telefonos[0]);
  });

  it('asks the repository for the exact slug', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);
    const spy = vi.spyOn(repo, 'findBySlug');

    await getPhoneBySlug(repo, 'iphone-15');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('iphone-15');
  });

  it('throws a 404 AppError when the slug does not exist', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);

    await expect(getPhoneBySlug(repo, 'galaxy-s24')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Celular no encontrado',
    });
  });

  it('throws 404 when the repository has no phones at all', async () => {
    const repo = new IPhoneRepositoryMock();

    await expect(getPhoneBySlug(repo, 'cualquier-slug')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Celular no encontrado',
    });
  });

  it('matches the slug exactly and not by partial text', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);

    await expect(getPhoneBySlug(repo, 'iphone-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('getPhones — listar celulares con filtros y paginación', () => {
  it('delegates the filters and pagination to the repository', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);
    const pagina = {
      data: [],
      meta: { total: 0, page: 2, limit: 5, totalPages: 0 },
    };
    const spy = vi
      .spyOn(repo, 'findAll')
      .mockImplementation(async () => pagina);

    const query: PhonesQueryDto = {
      page: 2,
      limit: 5,
      category: 'apple',
      brand: 'Apple',
      condition: 'CERTIFIED',
      verified: true,
      minPrice: 100,
      maxPrice: 2_000_000,
      search: 'iphone',
    };

    const result = await getPhones(repo, query);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      {
        category: 'apple',
        brand: 'Apple',
        condition: 'CERTIFIED',
        verified: true,
        minPrice: 100,
        maxPrice: 2_000_000,
        search: 'iphone',
      },
      2,
      5,
    );
    expect(result).toEqual(pagina);
  });

  it('applies the filters to the in-memory phones', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15', brand: 'Apple', price: 1_500_000 }),
      makePhone({ id: 'p2', slug: 'galaxy-s24', brand: 'Samsung', price: 3_000_000 }),
    ]);

    const result = await getPhones(repo, {
      page: 1,
      limit: 12,
      brand: 'Samsung',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].slug).toBe('galaxy-s24');
    expect(result.meta.total).toBe(1);
  });
});

describe('getPhoneById — obtener un celular por su id', () => {
  it('returns the phone when the id exists', async () => {
    const telefonos = [
      makePhone({ id: 'p1', slug: 'iphone-15' }),
      makePhone({ id: 'p2', slug: 'galaxy-s24' }),
    ];
    const repo = new IPhoneRepositoryMock(telefonos);

    const result = await getPhoneById(repo, 'p2');

    expect(result).toEqual(telefonos[1]);
  });

  it('throws a 404 AppError when the id does not exist', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);

    await expect(getPhoneById(repo, 'id-desconocido')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Celular no encontrado',
    });
  });
});

describe('createPhone — crear un celular', () => {
  it('creates a phone keeping every optional field provided', async () => {
    const repo = new IPhoneRepositoryMock();
    const data: CreatePhoneDto = {
      slug: 'iphone-15',
      name: 'iPhone 15',
      brand: 'Apple',
      categoryId: 'apple',
      price: 4_500_000,
      stock: 10,
      minStock: 5,
      condition: 'NEW',
      verified: true,
      compareAt: 5_000_000,
      badge: 'Nuevo',
      batteryHealth: 100,
      ram: '6GB',
      storage: '128GB',
      camera: '48MP',
      battery: '3.349 mAh',
      screen: '6.1"',
      chip: 'A16',
      shortDesc: 'Descripción corta',
      longDesc: 'Descripción larga',
      heroImage: 'https://ejemplo.com/iphone-15.jpg',
      images: [],
      colors: [],
      features: ['5G', 'Face ID'],
    };

    const result = await createPhone(repo, data);

    expect(result).toMatchObject({
      slug: 'iphone-15',
      name: 'iPhone 15',
      compareAt: 5_000_000,
      badge: 'Nuevo',
      batteryHealth: 100,
      ram: '6GB',
      storage: '128GB',
      camera: '48MP',
      battery: '3.349 mAh',
      screen: '6.1"',
      chip: 'A16',
      shortDesc: 'Descripción corta',
      longDesc: 'Descripción larga',
      heroImage: 'https://ejemplo.com/iphone-15.jpg',
    });
    await expect(repo.findById(result.id)).resolves.toMatchObject({
      slug: 'iphone-15',
    });
  });

  it('defaults the optional fields to null when they are absent', async () => {
    const repo = new IPhoneRepositoryMock();
    const data: CreatePhoneDto = {
      slug: 'galaxy-s24',
      name: 'Galaxy S24',
      brand: 'Samsung',
      categoryId: 'samsung',
      price: 3_000_000,
      stock: 4,
      // El DTO tiene .default(5): para cuando el dato llega al caso de uso
      // el valor ya está resuelto, así que aquí se escribe explícito.
      minStock: 5,
      condition: 'CERTIFIED',
      verified: false,
      images: [],
      colors: [],
      features: [],
    };

    const result = await createPhone(repo, data);

    expect(result).toMatchObject({
      slug: 'galaxy-s24',
      compareAt: null,
      badge: null,
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
    });
  });
});

describe('updatePhone — actualizar un celular', () => {
  it('updates an existing phone with the given data', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15', price: 1_500_000, stock: 5 }),
    ]);
    const data: UpdatePhoneDto = { price: 2_000_000, stock: 3 };
    const spy = vi.spyOn(repo, 'update');

    const result = await updatePhone(repo, 'p1', data);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('p1', data);
    expect(result.price).toBe(2_000_000);
    expect(result.stock).toBe(3);
  });

  it('throws a 404 AppError when the phone does not exist', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);

    await expect(
      updatePhone(repo, 'id-desconocido', { price: 1 }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Celular no encontrado',
    });
  });
});

describe('deletePhone — eliminar un celular', () => {
  it('deletes an existing phone', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);
    const spy = vi.spyOn(repo, 'delete');

    await deletePhone(repo, 'p1');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('p1');
    await expect(repo.findById('p1')).resolves.toBeNull();
  });

  it('throws a 404 AppError when the phone does not exist', async () => {
    const repo = new IPhoneRepositoryMock([
      makePhone({ id: 'p1', slug: 'iphone-15' }),
    ]);

    await expect(deletePhone(repo, 'id-desconocido')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Celular no encontrado',
    });
  });
});