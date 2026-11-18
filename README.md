# ERP Centro

Sistema web para controlar caja, ventas, compras, inventario, turnos, usuarios, auditoría y notificaciones de un centro interno.

- Moneda: **BOB**
- Zona horaria: **America/La_Paz**
- Medios de pago: **EFECTIVO** y **QR** (QR fijo configurado en el sistema)
- Roles: **ADMIN** y **ENCARGADO**

## Requisitos

- Node.js >= 20
- pnpm (la versión registrada en `packageManager` es pnpm 12.18.0)
- PostgreSQL. La base activa es **Supabase** (proyecto `ivcfkrughhztrmfvlwll`) mediante el **Session pooler IPv4**. La instancia embebida en `55432` queda como alternativa local.

## Instalación y arranque local

```bash
pnpm install
cp .env.example .env
```

Con Supabase ya no hace falta iniciar PostgreSQL local. Prepara la base de datos y los datos demo:

```bash
pnpm db:deploy
pnpm db:seed
```

> Si querés volver a la instancia embebida, cambia `DATABASE_URL` en `.env` a
> `postgresql://postgres:password@localhost:55432/erp_dev?schema=public`, ejecuta
> `pnpm pg:start` en otra terminal y repetí `pnpm db:deploy` y `pnpm db:seed`.

Inicia API y frontend:

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api
- Health check: http://localhost:3000/api/health

El proxy de Vite envía `/api` a `http://localhost:3000`.

## Credenciales demo

| Usuario | Contraseña | Rol | Turno |
| --- | --- | --- | --- |
| `admin@localhost` | `admin123` | ADMIN | Sin restricción de turno |
| `encargado1@localhost` | `enc12345` | ENCARGADO | Lunes a sábado, 08:00–14:00 |
| `encargado2@localhost` | `enc23456` | ENCARGADO | Lunes a sábado, 14:00–22:30 |

El administrador puede operar siempre. Los encargados solo pueden iniciar sesión y operar dentro de su turno; fuera de él reciben `OUT_OF_SHIFT`.

## Flujo operativo

1. El primer encargado del día abre la caja con un monto inicial.
2. Se registran ventas en EFECTIVO o QR y compras que actualizan el inventario.
3. Al cierre se propone automáticamente el efectivo y el QR esperados.
4. El QR contado es opcional: si se omite, se asume el esperado y queda registrado en auditoría.
5. El cierre diario tiene 60 minutos de gracia posteriores al turno; vencido ese plazo solo lo hace un administrador.
6. Con la caja cerrada no se permiten nuevas operaciones. Un administrador puede reabrirla indicando un motivo.
7. El sistema genera avisos internos y envía correo al administrador cuando corresponde.
8. Solo un ADMIN puede editar precios, crear items, ajustar stock y registrar compras. Los ENCARGADOS usan el POS para vender y consultar inventario/caja; no ven ni pueden registrar compras.

## Comandos útiles

```bash
pnpm test          # tests unitarios
pnpm typecheck     # verificación de tipos de API y web
pnpm build         # compilación completa

pnpm db:generate   # regenerar cliente Prisma
pnpm db:migrate    # crear una migración en desarrollo
pnpm db:deploy     # aplicar migraciones existentes
pnpm db:seed       # cargar/actualizar datos demo

pnpm pg:stop       # detener PostgreSQL embebido
pnpm pg:reset      # BORRAR el directorio de datos de desarrollo
```

> `pnpm pg:reset` es destructivo y solo afecta a la instancia embebida local. Con Supabase no es necesario. Después de usarlo, ejecuta `pnpm pg:start`, `pnpm db:deploy` y `pnpm db:seed`.

## Conexión a Supabase

`DATABASE_URL` apunta al Session pooler, que es IPv4 y está disponible en el plan gratuito:

```bash
DATABASE_URL="postgresql://postgres.ivcfkrughhztrmfvlwll:<DB_PASSWORD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
```

La conexión directa (`db.ivcfkrughhztrmfvlwll.supabase.co:5432`) solo tiene registro AAAA/IPv6. Desde redes sin IPv6 falla con `ENETUNREACH`. El *IPv4 add-on* que la corrige es de plan Pro; el Session pooler evita ese requisito. El host del pooler se obtiene en *Supabase Dashboard → Connect → Session pooler* (no se deduce de la región).

### SDK en el frontend

El cliente `@supabase/supabase-js` se inicializa en `apps/web/src/supabase.ts` con:

```bash
VITE_SUPABASE_URL="https://ivcfkrughhztrmfvlwll.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
```

Vite solo expone al navegador las variables prefijadas con `VITE_`. El panel *Configuración → Conexión Supabase* ejecuta una consulta real con el SDK. La autenticación del ERP **sigue siendo** la cookie JWT de NestJS y las reglas de negocio (turnos, caja, auditoría, permisos) siguen en la API: la publishable key usa RLS y no puede sustituirlas. Por eso `persistSession` está desactivado.

Las variables `NEXT_PUBLIC_*` se conservan por si se usa un framework que las requiera; en este proyecto Vite no las lee. Prisma **no** usa ninguna de ellas: se conecta con `DATABASE_URL`.

## Estructura

- `apps/api`: NestJS, Prisma, reglas de negocio, autenticación y auditoría.
- `apps/web`: React + Vite + TypeScript.
- `packages/shared`: esquemas Zod y constantes compartidas.
- `scripts/pg.mjs`: gestión de PostgreSQL embebido para desarrollo.
- `tests`: tests de esquemas y de la cadena de auditoría.

## Producción

Variables mínimas (el host puede inyectarlas; la API también carga un `.env` cercano sin sobrescribirlas):

```bash
DATABASE_URL="postgresql://postgres.TU_PROYECTO:TU_PASSWORD@TU_POOLER_HOST:5432/postgres?schema=public&sslmode=require"
JWT_SECRET="secreto-largo-y-aleatorio"   # obligatorio en producción
APP_URL="https://tu-dominio"              # debe coincidir con el origen público (CORS)
NODE_ENV="production"
API_PORT=3000
VITE_SUPABASE_URL="https://TU_PROYECTO.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_TU_KEY"
TIMEZONE="America/La_Paz"
CURRENCY="BOB"
SMTP_HOST="..."
SMTP_PORT=587
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="ERP Centro <no-reply@tu-dominio>"
```

> Las variables `VITE_*` se **incorporan al bundle en el momento del build**. Definilas antes de ejecutar `pnpm build`. La API falla rápido si `NODE_ENV=production` y `JWT_SECRET` no fue configurado.

Despliegue:

```bash
pnpm install --frozen-lockfile
pnpm db:deploy                      # aplica migraciones a Supabase
pnpm build                          # genera apps/api/dist y apps/web/dist
pnpm start:prod                     # API en 0.0.0.0:${API_PORT:-3000}
```

Sirve `apps/web/dist` con un servidor estático y configurá el proxy inverso:

- `GET /api/health` → API (health check para el balanceador).
- `/api/*` → API (mismo origen, sin CORS adicional).
- El resto → `apps/web/dist`, con fallback a `index.html` para rutas del SPA.

Si SMTP está vacío, los correos quedan registrados en el outbox/visor interno en lugar de enviarse. No hace falta PostgreSQL local: la API usa Supabase vía `DATABASE_URL`.

### Vercel (frontend) + Render (backend)

El repositorio incluye `vercel.json` con el rewrite `/api/:path*` hacia Render y el fallback SPA. Eso mantiene la cookie de sesión `httpOnly` en el **mismo origen** (`SameSite=Lax`), sin depender de CORS cross-site.

**Render — Web Service:**
- Build: `pnpm install --frozen-lockfile && pnpm build`
- Start: `pnpm start:prod`
- Health check: `/api/health`
- Variables: `DATABASE_URL`, `JWT_SECRET`, `APP_URL` (URL pública de Vercel), `NODE_ENV=production`, `SMTP_*`, `ADMIN_EMAIL`, `TIMEZONE`, `CURRENCY`. `PORT` lo inyecta Render y la API lo respeta.

**Vercel — proyecto Vite:**
- Root Directory: `apps/web` (o raíz con output `apps/web/dist`).
- Build: `pnpm build`.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (se hornean en el bundle).
- El rewrite `/api/:path*` apunta a `https://<TU-SERVICIO>.onrender.com/api/:path*`.

Si se cambia el dominio de Render o de Vercel, actualizar `vercel.json` y `APP_URL`/`CORS_ORIGINS` en Render.

## Seguridad y auditoría

- La autenticación usa una cookie `httpOnly` y protección CSRF de doble envío.
- Todas las operaciones sensibles quedan en un log inmutable con cadena de hashes SHA-256.
- No se realizan borrados físicos de registros auditables.
- El estado de la cadena se puede verificar desde Reportes → Auditoría.
