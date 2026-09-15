# Suite de pruebas — CelularPro API

257 pruebas en 28 archivos. **No necesita base de datos ni variables de
entorno**: se sustituye el cliente Prisma por un doble, así que corre igual en
tu máquina que en el pipeline.

```bash
npm test              # toda la suite
npm run test:watch    # en modo watch
npm run test:coverage # + reporte en coverage/ (incluye lcov.info para SonarQube)
```

## Cómo está montada

`tests/setup.ts` se ejecuta antes que cualquier archivo de prueba y hace tres
cosas:

1. Reemplaza `src/infrastructure/database/prisma` por el doble de
   `tests/helpers/prisma-mock.ts`.
2. Reemplaza `bcrypt` (módulo nativo, no portable entre sistemas) por un doble
   con la misma semántica: `hash()` transforma, `compare()` verifica.
3. Deja el doble en blanco antes de cada prueba.

Lo único simulado es la capa que habla con la base. Rutas, middlewares,
controladores, casos de uso y repositorios se ejecutan de verdad, que es
justamente lo que recorren los grafos de flujo. Cada prueba programa el doble
para forzar el camino que le interesa:

```ts
prismaMock.user.update.mockResolvedValue(usuarioConConteo({ banned: true }))
prismaMock.user.update.mockRejectedValue(errorRegistroNoEncontrado()) // P2025 → 404
```

## Estructura

```
tests/
├── setup.ts                    Dobles globales (Prisma y bcrypt)
├── helpers/
│   ├── prisma-mock.ts          El doble del cliente, un vi.fn() por método
│   └── fixtures.ts             Filas de prueba, tokens JWT reales y el error P2025
├── escenarios/                 Pruebas de camino básico sobre la API completa
│   ├── esc-26-banear-usuario.test.ts          V(G)=7
│   ├── esc-27-desbanear-usuario.test.ts       V(G)=5
│   ├── esc-28-consultar-usuarios.test.ts      V(G)=6
│   ├── esc-29-panel-estadisticas.test.ts      V(G)=6
│   ├── esc-30-administracion-catalogo.test.ts V(G)=10
│   ├── esc-31-alertas-stock.test.ts           V(G)=8
│   ├── esc-32-lista-favoritos.test.ts         V(G)=9
│   ├── autenticacion.test.ts          register / login / me
│   ├── pedidos.test.ts                crear, consultar y cambiar estado
│   ├── catalogo-publico.test.ts       listado, filtros y detalle
│   ├── ramas-de-error.test.ts         cambio de rol y fallos de infraestructura
│   └── ramas-restantes.test.ts        estados terminales, CORS y 500 en producción
└── unit/                       Pruebas por caso de uso, middleware y DTO
    ├── alertas/ catalogo/ control-roles/ errores/ favoritos/
    ├── gestion-perfil/ login/ pedidos/ registro/ validacion-credenciales/
```

## Fixtures

| Función | Para qué sirve |
|---|---|
| `usuario()` / `usuarioConConteo()` | Arma la fila de un usuario (la segunda, con `_count.orders`, como la devuelve el panel) |
| `celular()` | Fila de un celular con sus relaciones |
| `autenticar()` / `autenticarAdmin()` | Devuelve `{ user, token }` y además registra al usuario en el doble, porque `auth.middleware` relee su estado en cada request |
| `generarToken()` / `tokenConFirmaInvalida()` / `tokenExpirado()` | JWT reales, firmados con el mismo secreto que usa el servidor |
| `errorRegistroNoEncontrado()` | El `PrismaClientKnownRequestError` P2025 real, que es lo que activa el 404 |
| `bodyCelularValido()` | Body mínimo que aprueba `createPhoneDto` |
| `alerta()` | Fila de la tabla `Alert` con su celular incluido, como la devuelve `listAlerts()` |
| `favorito()` | Fila de la tabla `Favorite` con su celular incluido, antes del mapeo al dominio |
| `ID_INEXISTENTE` | UUID que nunca corresponde a un registro |

## Cobertura

100% de líneas, ramas y funciones sobre `src/`. Quedan fuera del cálculo
`src/domain/entities` y `src/domain/repositories` (solo declaran tipos, no
generan código ejecutable), `src/server.ts` y `src/infrastructure/database`
(arranque y siembra).
