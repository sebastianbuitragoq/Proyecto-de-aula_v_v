import { describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { registerUser } from '../../../src/application/use-cases/auth.use-cases'
import { UserRepository } from '../../../src/infrastructure/repositories/UserRepository'
import { AppError } from '../../../src/domain/AppError'
import { prismaMock } from '../../helpers/prisma-mock'
import { usuario } from '../../helpers/fixtures'

// Basado en: application/use-cases/auth.use-cases.ts — registerUser()
//
// repo es el UserRepository real. En vez de mirar la base, se comprueba lo
// que el caso de uso mandó a escribir: que la contraseña viaje hasheada y
// nunca en texto plano, y que el token firmado corresponda al usuario creado.

const repo = new UserRepository()

describe('registerUser', () => {
  // Camino 1,2,3,4,5,F — email ya registrado en BD
  it('lanza AppError 409 cuando el email ya existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({ email: 'user@correo.com' }),
    )

    await expect(
      registerUser(repo, {
        email: 'user@correo.com',
        name: 'Mario',
        password: 'password123',
      }),
    ).rejects.toMatchObject({
      message: 'El email ya está registrado',
      statusCode: 409,
    })

    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('el error lanzado es una instancia de AppError', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      usuario({ email: 'user@correo.com' }),
    )

    await expect(
      registerUser(repo, {
        email: 'user@correo.com',
        name: 'Mario',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(AppError)
  })

  // Camino 1,2,3,4,6,7,8,9,F — email no registrado
  it('crea el usuario, hashea la contraseña con bcrypt y retorna user + token sin exponer el password', async () => {
    const creado = usuario({
      email: 'user@correo.com',
      name: 'Mario',
      password: 'password123',
    })
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue(creado)

    const result = await registerUser(repo, {
      email: 'user@correo.com',
      name: 'Mario',
      password: 'password123',
    })

    expect(result.user).not.toHaveProperty('password')
    expect(result.user.email).toBe('user@correo.com')

    // La contraseña que se mandó a guardar va hasheada, no en texto plano.
    const guardado = prismaMock.user.create.mock.calls[0][0] as {
      data: { password: string }
    }
    expect(guardado.data.password).not.toBe('password123')
    expect(await bcrypt.compare('password123', guardado.data.password)).toBe(
      true,
    )

    // El token es un JWT real, firmado con los datos del usuario recién creado.
    const payload = jwt.verify(
      result.token,
      process.env.JWT_SECRET as string,
    ) as { id: string; role: string }
    expect(payload.id).toBe(creado.id)
    expect(payload.role).toBe('USER')
  })
})
