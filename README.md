# Farmacia · Mostrador

Sistema de mostrador para farmacias en Venezuela: venta con alternativas por precio, inventario por lotes (FEFO), ficha del paciente por cédula, lista de espera con WhatsApp y Pago Móvil, y lectura de récipes asistida por IA. Una sola app para PC, tablet y teléfono.

**Demo de la interfaz (datos de ejemplo):** https://theyafar.github.io/farmacia/

Capturas de la app real en [`docs/pantallas`](docs/pantallas).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Fases, qué está hecho, qué falta y qué definir con el cliente |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Cómo está armado: diagramas, modelo de datos y flujos |
| [docs/SEGURIDAD.md](docs/SEGURIDAD.md) | Cada control de seguridad y dónde está en el código |
| [docs/API.md](docs/API.md) | Todas las rutas de la API y quién puede usarlas |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Puesta en marcha en un VPS de Contabo, paso a paso |
| [docs/NEGOCIO.md](docs/NEGOCIO.md) | Costos, modelo de suscripción y cómo tratar con los clientes |

## Estructura

```
apps/web         App real conectada a la API (React, Vite, TypeScript, Tailwind)
apps/demo        Demo con datos de ejemplo (la de GitHub Pages)
apps/api         API NestJS + PostgreSQL (Prisma)
packages/shared  Reglas y validaciones comunes a la app y la API
infra            Docker Compose, Caddy (HTTPS), respaldos, preparación del servidor
docs             Documentación
```

## Desarrollo local

Necesitas Node.js 22 y PostgreSQL 16.

```bash
npm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Edita `apps/api/.env` (base de datos y secretos), y luego:

```bash
npm run build -w @farmacia/shared
```

```bash
npm run db:migrate:dev -w @farmacia/api
```

```bash
npm run build -w @farmacia/api && SEED_DEMO=true npm run db:seed -w @farmacia/api
```

```bash
npm run dev:api
```

En otra terminal (la app abre en http://localhost:5173 y envía `/api` al servidor local):

```bash
npm run dev:web
```

## Pruebas

Las pruebas de la API corren contra una base PostgreSQL real (`DATABASE_URL_TEST`):

```bash
npm test
```

GitHub las corre en cada cambio (`.github/workflows/ci.yml`). La demo se publica sola en GitHub Pages cuando cambia `apps/demo` (`.github/workflows/deploy.yml`).
