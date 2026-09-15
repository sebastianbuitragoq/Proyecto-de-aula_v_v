import { describe, expect, it } from 'vitest'
import { changeUserRole } from '../../../src/application/use-cases/admin.use-cases'
import { AdminRepository } from '../../../src/infrastructure/repositories/AdminRepository'
import { prismaMock } from '../../helpers/prisma-mock'
import { usuarioConConteo } from '../../helpers/fixtures'

// Igual que control-roles/changeUserRole.use-case.test.ts, pero cubriendo
// también el caso de degradar de ADMIN a USER. Se deja como archivo aparte
// porque documenta ese camino con datos propios.
//
// El repositorio es el AdminRepository de verdad: lo único sustituido es el
// cliente Prisma, así que el mapeo de la fila a AdminUser también se ejerce.

const repo = new AdminRepository()

describe('changeUserRole', () => {
  it('promueve a un USER a ADMIN', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })
    const usuario = usuarioConConteo({ role: 'USER' })
    prismaMock.user.update.mockResolvedValue({ ...usuario, role: 'ADMIN' })

    const result = await changeUserRole(
      repo,
      usuario.id,
      { role: 'ADMIN' },
      admin.id,
    )

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: usuario.id },
        data: { role: 'ADMIN' },
      }),
    )
    expect(result.role).toBe('ADMIN')
  })

  it('rechaza que un admin cambie su propio rol', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })

    await expect(
      changeUserRole(repo, admin.id, { role: 'ADMIN' }, admin.id),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('degrada a un ADMIN a USER', async () => {
    const admin = usuarioConConteo({ role: 'ADMIN' })
    const otroAdmin = usuarioConConteo({ role: 'ADMIN' })
    prismaMock.user.update.mockResolvedValue({ ...otroAdmin, role: 'USER' })

    const result = await changeUserRole(
      repo,
      otroAdmin.id,
      { role: 'USER' },
      admin.id,
    )

    expect(result.role).toBe('USER')
  })
})
