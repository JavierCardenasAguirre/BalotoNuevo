import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CONFIG_JUEGO,
  calcularAciertosDeJugada,
  type AciertoJugada,
  type JugadaPersistida,
  type SorteoInput,
  type TipoJuego,
} from '@/lib/analisis-probabilistico';
import type { RendimientoRealItem } from '@/lib/types';

export interface SorteoRowDb {
  id?: number;
  juego: TipoJuego;
  fecha: string;
  numeros: number[];
  sb: number | null;
  creado_en?: string;
}

interface JugadaRowDb {
  id?: number;
  juego: TipoJuego;
  para_fecha: string;
  numeros: JugadaPersistida[];
  generado_en?: string;
  aciertos?: AciertoJugada[] | null;
  total_aciertos?: number | null;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseSingleton: SupabaseClient | null | undefined;

const DIAS_SORTEO: Record<TipoJuego, number[]> = {
  baloto: [1, 3, 6],
  miloto: [1, 2, 4, 5],
  powerball: [1, 3, 6],
};

export function supabaseConfigurado(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseSingleton !== undefined) return supabaseSingleton;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    supabaseSingleton = null;
    return supabaseSingleton;
  }

  supabaseSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseSingleton;
}

function parseNumerosJson(numeros: unknown): number[] {
  if (!Array.isArray(numeros)) return [];
  return numeros
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n));
}

function parseAciertosJson(aciertos: unknown): AciertoJugada[] | null {
  if (!Array.isArray(aciertos)) return null;
  const parsed = aciertos
    .map((item) => {
      const obj = item as { hits?: unknown; sb_ok?: unknown };
      const hits = Number(obj.hits);
      const sb_ok = Boolean(obj.sb_ok);
      if (!Number.isFinite(hits)) return null;
      return { hits, sb_ok };
    })
    .filter((x): x is AciertoJugada => x !== null);

  return parsed.length ? parsed : null;
}

function parseJugadasJson(jugadas: unknown): JugadaPersistida[] {
  if (!Array.isArray(jugadas)) return [];
  return jugadas
    .map((j) => {
      const item = j as { nums?: unknown; sb?: unknown };
      const nums = Array.isArray(item.nums)
        ? item.nums.map((n) => Number(n)).filter((n) => Number.isInteger(n))
        : [];
      const sb = item.sb === null || item.sb === undefined ? null : Number(item.sb);
      return {
        nums,
        sb: Number.isInteger(sb) ? sb : null,
      };
    })
    .filter((j) => j.nums.length === 5);
}

function rowToSorteoInput(row: SorteoRowDb): SorteoInput {
  return {
    date: row.fecha,
    regulares: parseNumerosJson(row.numeros),
    superbalota: row.sb ?? undefined,
  };
}

function rowToRendimiento(row: JugadaRowDb): RendimientoRealItem {
  return {
    juego: row.juego,
    para_fecha: row.para_fecha,
    generado_en: row.generado_en,
    jugadas: parseJugadasJson(row.numeros),
    aciertos: parseAciertosJson(row.aciertos),
    total_aciertos: row.total_aciertos ?? null,
  };
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function calcularProximaFechaSorteo(juego: TipoJuego, baseDate?: string): string {
  const dias = DIAS_SORTEO[juego];
  const base = baseDate ? parseIsoDate(baseDate) : new Date();
  base.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + i);
    const day = candidate.getDay();
    const dayAdjusted = day === 0 ? 7 : day;
    if (dias.includes(dayAdjusted)) {
      return toIsoDate(candidate);
    }
  }

  return toIsoDate(base);
}

export async function cargarSorteosPorJuego(juego: TipoJuego): Promise<SorteoInput[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('sorteos')
    .select('juego, fecha, numeros, sb')
    .eq('juego', juego)
    .order('fecha', { ascending: true });

  if (error) throw new Error(`Supabase (${juego}): ${error.message}`);

  return (data ?? []).map((row) => rowToSorteoInput(row as unknown as SorteoRowDb));
}

export async function cargarUltimosSorteosPorJuego(juego: TipoJuego, limite = 10): Promise<SorteoInput[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('sorteos')
    .select('juego, fecha, numeros, sb')
    .eq('juego', juego)
    .order('fecha', { ascending: false })
    .limit(limite);

  if (error) throw new Error(`Supabase (últimos ${juego}): ${error.message}`);

  return (data ?? []).map((row) => rowToSorteoInput(row as unknown as SorteoRowDb));
}

export async function upsertSorteoManual(payload: SorteoRowDb): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase no está configurado.');
  }

  const { error } = await client
    .from('sorteos')
    .upsert(
      {
        juego: payload.juego,
        fecha: payload.fecha,
        numeros: payload.numeros,
        sb: payload.sb ?? null,
      },
      { onConflict: 'juego,fecha', ignoreDuplicates: false },
    );

  if (error) throw new Error(`Error guardando sorteo: ${error.message}`);
}

export async function obtenerJugadaProgramada(juego: TipoJuego, paraFecha: string): Promise<RendimientoRealItem | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('jugadas')
    .select('juego, para_fecha, numeros, generado_en, aciertos, total_aciertos')
    .eq('juego', juego)
    .eq('para_fecha', paraFecha)
    .maybeSingle();

  if (error) {
    if (error.message.toLowerCase().includes('does not exist')) return null;
    throw new Error(`Error leyendo jugadas: ${error.message}`);
  }

  return data ? rowToRendimiento(data as unknown as JugadaRowDb) : null;
}

export async function guardarJugadaProgramada(
  juego: TipoJuego,
  paraFecha: string,
  jugadas: JugadaPersistida[],
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client
    .from('jugadas')
    .upsert(
      {
        juego,
        para_fecha: paraFecha,
        numeros: jugadas,
        aciertos: null,
        total_aciertos: null,
      },
      { onConflict: 'juego,para_fecha', ignoreDuplicates: true },
    );

  if (error) {
    if (error.message.toLowerCase().includes('does not exist')) return;
    throw new Error(`Error guardando jugadas: ${error.message}`);
  }
}

export async function cargarRendimientoReal(juego: TipoJuego): Promise<RendimientoRealItem[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('jugadas')
    .select('juego, para_fecha, numeros, generado_en, aciertos, total_aciertos')
    .eq('juego', juego)
    .order('para_fecha', { ascending: false })
    .limit(40);

  if (error) {
    if (error.message.toLowerCase().includes('does not exist')) return [];
    throw new Error(`Error leyendo rendimiento real: ${error.message}`);
  }

  return (data ?? []).map((row) => rowToRendimiento(row as unknown as JugadaRowDb));
}

export async function actualizarAciertosPendientes(
  juego: TipoJuego,
  historial: SorteoInput[],
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const ultimo = historial[historial.length - 1];
  if (!ultimo) return;

  const { data, error } = await client
    .from('jugadas')
    .select('id, juego, para_fecha, numeros, aciertos, total_aciertos')
    .eq('juego', juego)
    .lte('para_fecha', ultimo.date)
    .is('aciertos', null)
    .order('para_fecha', { ascending: true });

  if (error) {
    if (error.message.toLowerCase().includes('does not exist')) return;
    throw new Error(`Error buscando aciertos pendientes: ${error.message}`);
  }

  const byDate = new Map(historial.map((s) => [s.date, s]));
  const usaSb = CONFIG_JUEGO[juego].usaSuperbalota;

  for (const rowUnknown of data ?? []) {
    const row = rowUnknown as unknown as JugadaRowDb;
    const sorteo = byDate.get(row.para_fecha);
    if (!sorteo) continue;

    const jugadas = parseJugadasJson(row.numeros);
    const aciertos = jugadas.map((j) => calcularAciertosDeJugada(j, sorteo, usaSb));
    const total = aciertos.reduce((acc, a) => acc + a.hits, 0);

    const { error: updError } = await client
      .from('jugadas')
      .update({ aciertos, total_aciertos: total })
      .eq('juego', juego)
      .eq('para_fecha', row.para_fecha);

    if (updError) {
      throw new Error(`Error actualizando aciertos (${juego} ${row.para_fecha}): ${updError.message}`);
    }
  }
}
