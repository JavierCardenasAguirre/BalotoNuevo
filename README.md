# 🎰 Loto Analyzer (Baloto · MiLoto · Powerball)

Aplicación en **Next.js 14 + TypeScript** para análisis estadístico de loterías.

> ⚠️ **Principio central:** todas las combinaciones tienen la misma probabilidad de salir. El historial **no predice** el próximo sorteo.

---

## ✅ Mejoras críticas implementadas

1. **Determinismo total**
   - Sin `Math.random()` para generar jugadas.
   - PRNG sembrado (xmur3 + mulberry32) con:
     - juego,
     - fecha del último sorteo,
     - números del último sorteo.
   - Resultado: para los mismos datos, las jugadas son siempre idénticas.

2. **Jugadas disjuntas**
   - Se construye un pool de **30 números top** y se reparte en 6 jugadas de 5 números, **sin repetir**.
   - Cada número del pool aparece una sola vez.
   - Para Baloto/Powerball, la bola especial también se asigna sin repetición entre jugadas.

3. **Persistencia de jugadas + aciertos reales**
   - Tabla nueva en Supabase: `jugadas`.
   - Se guardan jugadas por `(juego, para_fecha)`.
   - Se calculan aciertos automáticamente cuando existe resultado real para esa fecha.
   - Si no hay Supabase, fallback a `localStorage`.

4. **Probabilidades reales visibles en UI**
   - Nueva tabla de probabilidades por juego.
   - Nota visible de honestidad: la probabilidad no cambia por usar estadísticas.

5. **UI actualizada**
   - Botón principal: **"Ver análisis del historial"**.
   - Nota: jugadas fijas hasta próximo sorteo y actualización al entrar nuevos resultados.

---

## 🧱 SQL requerido en Supabase

### Tabla sorteos (si aún no existe)

```sql
create table if not exists public.sorteos (
  id bigint generated always as identity primary key,
  juego text not null check (juego in ('baloto', 'miloto', 'powerball')),
  fecha date not null,
  numeros jsonb not null,
  sb integer,
  creado_en timestamptz not null default now(),
  unique (juego, fecha)
);

alter table public.sorteos enable row level security;

create policy "lectura publica" on public.sorteos
for select using (true);

create policy "insercion anon" on public.sorteos
for insert with check (true);

create policy "actualizacion anon" on public.sorteos
for update using (true) with check (true);
```

### Tabla jugadas (nueva)

```sql
create table if not exists public.jugadas (
  id bigint generated always as identity primary key,
  juego text not null check (juego in ('baloto', 'miloto', 'powerball')),
  para_fecha date not null,
  numeros jsonb not null,
  generado_en timestamptz not null default now(),
  aciertos jsonb,
  total_aciertos integer,
  unique (juego, para_fecha)
);
alter table public.jugadas enable row level security;
create policy "lectura publica jugadas" on public.jugadas for select using (true);
create policy "insercion anon jugadas" on public.jugadas for insert with check (true);
create policy "actualizacion anon jugadas" on public.jugadas for update using (true) with check (true);
```

---

## 🔐 Variables de entorno

Copia `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

Variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://qckgrpvlexondirgfrwy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key>
```

---

## 🚀 Uso

```bash
npm install --legacy-peer-deps
npm run dev
```

Abrir `http://localhost:3000`.

---

## 🔄 Automatización y scripts

### Actualización incremental (API + cron)

- Endpoint: `/api/actualizar-sorteos`
- Cron Vercel en `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/actualizar-sorteos", "schedule": "0 12 * * *" }
  ]
}
```

### Scripts disponibles

```bash
npm run actualizar:sorteos   # Descarga completos + upsert a Supabase (si está configurado)
npm run seed:supabase        # Seed desde public/data/*.json a Supabase
npm run test:jugadas         # Validación determinismo + disjunción + fixture de aciertos
```

---

## 🧪 Test crítico esperado

`npm run test:jugadas` valida:

1. **Determinismo**: 3 llamadas seguidas → mismas jugadas.
2. **Disjunción**: 6 jugadas Baloto sin número repetido (30 distintos).
3. **Fixture** (26/09/2026): total_aciertos = **3** para el set proporcionado.

---

## 📂 Archivos clave

- `lib/analisis-probabilistico.ts` → motor determinista + disjunción + probabilidades
- `lib/supabase.ts` → capa de datos (sorteos + jugadas + aciertos)
- `app/components/baloto-app.tsx` → orquestación + persistencia/fallback
- `app/components/panel-resultados.tsx` → jugadas, tabla probabilidades y rendimiento real
- `app/api/actualizar-sorteos/route.ts` → actualización incremental
- `scripts/test-jugadas.ts` → pruebas ejecutables

---

## 🛠️ Build

```bash
npm run build
```
