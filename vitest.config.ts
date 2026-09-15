import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Toda la suite vive bajo tests/ para que no entre al build de producción.
    //   tests/escenarios  → pruebas de camino básico sobre la API completa
    //   tests/unit        → pruebas unitarias por caso de uso, middleware y DTO
    include: ['tests/**/*.test.ts'],

    environment: 'node',

    // Instala el doble del cliente Prisma y el de bcrypt antes de que
    // cualquier repositorio los importe, y deja el doble en blanco entre
    // pruebas. La suite no necesita Postgres ni variables de entorno.
    setupFiles: ['tests/setup.ts'],

    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'secreto-solo-para-pruebas',
    },

    // Cada archivo corre en su propio entorno de módulos, así que su propio
    // doble de Prisma: lo que programa un archivo no se filtra a otro.
    isolate: true,

    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        // seed.ts y el cliente Prisma: scripts de infraestructura que no
        // forman parte de la lógica bajo prueba.
        'src/infrastructure/database/**',
        'src/server.ts',
        // Solo declaran tipos e interfaces: al compilar no queda ninguna
        // línea ejecutable, así que siempre figurarían en 0% por más
        // pruebas que se escriban.
        'src/domain/entities/**',
        'src/domain/repositories/**',
      ],

      // SonarQube lee coverage/lcov.info (sonar.javascript.lcov.reportPaths).
      // Sin declarar 'lcov' aquí, Vitest usa sus reporters por defecto
      // (text, html, clover, json) y ese archivo NUNCA se genera, así que
      // Sonar no encuentra nada y reporta 0.0% de cobertura.
      reporter: ['text', 'lcov', 'html'],
    },
  },
})
