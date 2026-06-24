# GADS

# Sistema de Gestion de Novedades Laborales y Control Horario

Aplicacion SPA (React + Vite + TypeScript) con backend en Supabase:

- Postgres (persistencia)
- Edge Function `api` (capa backend)
- Supabase Auth (`email/password`)

## Requisitos

- Node.js 18+
- Supabase CLI (opcional, recomendado para migraciones locales)

## Configuracion de entorno

Completa `.env` a partir de `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Puesta en marcha (frontend)

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Ejecutar en modo desarrollo:

   ```bash
   npm run dev
   ```

## Base de datos y Edge Function

Archivos agregados:

- `supabase/migrations/20260418190000_init.sql`
- `supabase/seed/000_base_seed.sql`
- `supabase/functions/api/index.ts`

Flujo sugerido con Supabase CLI:

```bash
supabase db push
supabase functions deploy api
```

## Seed de usuarios Auth

Para crear/actualizar usuarios base de login (`admin`, `empleado`, `contador`):

```bash
npm run seed:auth
```

## Scripts

- `npm run dev` — arranca Vite.
- `npm run build` — build estatico de la SPA.
- `npm run preview` — previsualizacion del build.
- `npm run lint` — chequeo de tipos con `tsc --noEmit`.
- `npm run seed:auth` — crea usuarios de Supabase Auth y perfiles base.

## Notas

- `server.ts` quedo deprecado (ya no se usa como backend runtime).
- Todas las operaciones de datos pasan por `functions/v1/api`.
- El frontend no consulta tablas directamente.
