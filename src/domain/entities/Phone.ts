export type Condition = 'NEW' | 'CERTIFIED' | 'USED'

export interface PhoneColor {
  id?: number
  colorId: string
  name: string
  hex: string
}

export interface PhoneImage {
  id?: number
  url: string
  position: number
}

export interface Phone {
  id: string
  slug: string
  name: string
  brand: string
  categoryId: string
  price: number
  compareAt: number | null
  badge: string | null
  stock: number
  /** Umbral de reposición: al llegar o bajar de aquí se levanta una alerta. */
  minStock: number
  condition: Condition
  verified: boolean
  batteryHealth: number | null
  ram: string | null
  storage: string | null
  camera: string | null
  battery: string | null
  screen: string | null
  chip: string | null
  shortDesc: string | null
  longDesc: string | null
  heroImage: string | null
  images: PhoneImage[]
  colors: PhoneColor[]
  features: string[]
  createdAt: Date
  updatedAt: Date
}

export type PhoneListItem = Pick<
  Phone,
  | 'id'
  | 'slug'
  | 'name'
  | 'brand'
  | 'price'
  | 'compareAt'
  | 'badge'
  | 'stock'
  | 'condition'
  | 'verified'
  | 'batteryHealth'
  | 'storage'
  | 'ram'
  | 'shortDesc'
  | 'heroImage'
> & { category: string }
