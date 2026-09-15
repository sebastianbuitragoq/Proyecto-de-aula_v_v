import { describe, expect, it } from 'vitest'
import { changeUserRole } from '../../../src/application/use-cases/admin.use-cases'
import { AdminRepository } from '../../../src/infrastructure/repositories/AdminRepository'
import { AppError } from '../../../src/domain/AppError'
import { prismaMock } from '../../helpers/prisma-mock'
import { usuarioConConteo } from '../../helpers/fixtures'

// Basado en: application/use-cases/admin.use-cases.ts — changeUserRole()
//
// repo es el AdminRepository real: lo único que se reemplaza es el cliente
// Prisma. Así, si algún día el repositorio cambia de forma, esta prueba lo
// nota igual que lo notaría el código real.

const repo = new AdminRepository()

describe('changeUserRole', () => {
  // Camino 1,2,3,4,F — admin intenta cambiar su propio rol
  it('lanza AppError 400 y no modifica ningún registro si userId === requesterId', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })

    await expect(
      changeUserRole(repo, admin.id, { role: 'USER' }, admin.id),
    ).rejects.toMatchObject({
      message: 'No puedes cambiar tu propio rol',
      statusCode: 400,
    })

    // La guarda corta antes de tocar la base: ninguna escritura salió.
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('el error lanzado es una instancia de AppError', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })

    await expect(
      changeUserRole(repo, admin.id, { role: 'USER' }, admin.id),
    ).rejects.toBeInstanceOf(AppError)
  })

  // Camino 1,2,3,5,6,F — admin cambia el rol de otro usuario
  it('cambia el rol de otro usuario cuando quien pide el cambio es un admin distinto', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })
    const otro = usuarioConConteo({ role: 'USER' })
    prismaMock.user.update.mockResolvedValue({ ...otro, role: 'ADMIN' })

    const result = await changeUserRole(
      repo,
      otro.id,
      { role: 'ADMIN' },
      admin.id,
    )

    expect(result.id).toBe(otro.id)
    expect(result.role).toBe('ADMIN')
  })
})
