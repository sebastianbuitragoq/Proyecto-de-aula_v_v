import 'dotenv/config'
import prisma from './prisma'
import seedData from './seed-data.json'

// El catálogo vive en seed-data.json: son datos, no lógica. Antes estaban
// los 9 teléfonos escritos uno por uno dentro de este archivo, repitiendo
// las mismas 21 claves y el mismo bloque de imágenes/colores/features cada
// vez (lo que SonarQube marcaba como duplicación). Aquí solo queda el
// armado, que se escribe una sola vez y sirve para todos.

type Condition = 'NEW' | 'CERTIFIED' | 'USED'

type PhoneSeed = {
  slug: string
  name: string
  brand: string
  categoryId: string
  price: number
  compareAt: number
  badge: string | null
  stock: number
  condition: string
  verified?: boolean
  batteryHealth?: number
  ram: string
  storage: string
  camera: string
  battery: string
  screen: string
  chip: string
  shortDesc: string
  longDesc: string
  heroImage: string
  gallery: string[]
  heroFirst?: boolean
  colors: { colorId: string; name: string; hex: string }[]
  features: string[]
}

// La hero se declara una sola vez y su posición dentro de la galería sale
// de heroFirst; los índices de images y features salen del arreglo.
function toPrismaPhone({
  gallery,
  heroFirst,
  colors,
  features,
  condition,
  ...phone
}: PhoneSeed) {
  const urls = heroFirst
    ? [phone.heroImage, ...gallery]
    : [...gallery, phone.heroImage]

  return {
    ...phone,
    condition: condition as Condition,
    verified: phone.verified ?? true,
    images: {
      createMany: { data: urls.map((url, position) => ({ url, position })) },
    },
    colors: { createMany: { data: colors } },
    features: {
      createMany: {
        data: features.map((feature, position) => ({ feature, position })),
      },
    },
  }
}

async function seed() {
  console.log('Sembrando datos iniciales...')

  await prisma.category.createMany({
    data: seedData.categories,
    skipDuplicates: true,
  })

  // Admin por defecto
  const bcrypt = await import('bcrypt')
  const adminPassword = await bcrypt.hash('admin1234', 12)
  await prisma.user.upsert({
    where: { email: 'admin@celularpro.co' },
    update: {},
    create: {
      email: 'admin@celularpro.co',
      name: 'Admin CelularPro',
      password: adminPassword,
      role: 'ADMIN',
    },
  })

  // Limpiar teléfonos anteriores para recargar con imágenes nuevas
  await prisma.phoneFeature.deleteMany({})
  await prisma.phoneColor.deleteMany({})
  await prisma.phoneImage.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.phone.deleteMany({})

  for (const phone of seedData.phones as PhoneSeed[]) {
    await prisma.phone.create({ data: toPrismaPhone(phone) })
  }

  console.log('✓ Datos iniciales listos')
  console.log(`  Admin: admin@celularpro.co / admin1234`)
  console.log(`  ${seedData.phones.length} teléfonos con imágenes de alta calidad`)
  console.log('  Todas las imágenes: 3 por producto, 800px ancho optimizado')
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
