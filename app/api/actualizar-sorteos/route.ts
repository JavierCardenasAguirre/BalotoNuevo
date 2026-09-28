import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { TipoJuego } from '@/lib/types';

type SorteoConSb = { date: string; regulares: number[]; sb: number };
type SorteoSinSb = { date: string; regulares: number[] };

type SorteoRegistro = {
  juego: TipoJuego;
  fecha: string;
  numeros: number[];
  sb: number | null;
};

const monthMap: Record<string, string> = {
  ene: '01', enero: '01',
  feb: '02', febrero: '02',
  mar: '03', marzo: '03',
  abr: '04', abril: '04',
  may: '05', mayo: '05',
  jun: '06', junio: '06',
  jul: '07', julio: '07',
  ago: '08', agosto: '08',
  sep: '09', sept: '09', septiembre: '09',
  oct: '10', octubre: '10',
  nov: '11', noviembre: '11',
  dic: '12', diciembre: '12',
  jan: '01', january: '01',
  february: '02',
  march: '03',
  apr: '04', april: '04',
  june: '06',
  july: '07',
  aug: '08', august: '08',
  october: '10',
  november: '11',
  december: '12',
};

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateCompactEs(text: string): string | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const re = /(\d{1,2})\s*([a-záéíóúñ\.]+)\s*(\d{4})/i;
  const match = normalized.match(re);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const monthToken = match[2].replace(/[\.]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const year = match[3];
  const month = monthMap[monthToken];
  if (!month) return null;

  return `${year}-${month}-${day}`;
}

function parseDateLongEs(text: string): string | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const re = /(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i;
  const match = normalized.match(re);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const monthToken = match[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const year = match[3];
  const month = monthMap[monthToken];
  if (!month) return null;

  return `${year}-${month}-${day}`;
}

function extractRows(html: string): string[] {
  return html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
}

function isUniqueFive(numbers: number[]): boolean {
  return new Set(numbers).size === 5;
}

function validarBaloto(regulares: number[], sb: number): boolean {
  return regulares.length === 5
    && regulares.every((n) => n >= 1 && n <= 43)
    && isUniqueFive(regulares)
    && sb >= 1
    && sb <= 16;
}

function validarPowerball(regulares: number[], sb: number): boolean {
  return regulares.length === 5
    && regulares.every((n) => n >= 1 && n <= 69)
    && isUniqueFive(regulares)
    && sb >= 1
    && sb <= 26;
}

function validarMiloto(regulares: number[]): boolean {
  return regulares.length === 5
    && regulares.every((n) => n >= 1 && n <= 39)
    && isUniqueFive(regulares);
}

async function fetchBalotoIncremental(year: number): Promise<SorteoConSb[]> {
  const url = `https://resultados-de-loteria.com/baloto/resultados/${year}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LotoAnalyzer/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Baloto HTTP ${res.status}`);

  const html = await res.text();
  const rows = extractRows(html);
  const out = new Map<string, SorteoConSb>();

  for (const row of rows) {
    const text = stripHtml(row);
    const fecha = parseDateCompactEs(text);
    if (!fecha) continue;

    const numbers = (text.match(/\d+/g) ?? []).map(Number);
    if (numbers.length < 6) continue;

    const regulares = numbers.slice(0, 5).sort((a, b) => a - b);
    const sb = numbers[5];

    if (!validarBaloto(regulares, sb)) continue;
    out.set(fecha, { date: fecha, regulares, sb });
  }

  return Array.from(out.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchPowerballIncremental(year: number): Promise<SorteoConSb[]> {
  const url = `https://resultados-de-loteria.com/powerball/resultados/${year}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LotoAnalyzer/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Powerball HTTP ${res.status}`);

  const html = await res.text();
  const rows = extractRows(html);
  const out = new Map<string, SorteoConSb>();

  for (const row of rows) {
    const text = stripHtml(row);
    const fecha = parseDateCompactEs(text);
    if (!fecha) continue;

    const numbers = (text.match(/\d+/g) ?? []).map(Number);
    if (numbers.length < 6) continue;

    const regulares = numbers.slice(0, 5).sort((a, b) => a - b);
    const sb = numbers[5];

    if (!validarPowerball(regulares, sb)) continue;
    out.set(fecha, { date: fecha, regulares, sb });
  }

  return Array.from(out.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchMilotoIncremental(): Promise<SorteoSinSb[]> {
  const url = 'https://quecayo.com/miloto/historico?page=1';
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LotoAnalyzer/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`MiLoto HTTP ${res.status}`);

  const html = await res.text();
  const rows = extractRows(html);
  const out = new Map<string, SorteoSinSb>();

  for (const row of rows) {
    const text = stripHtml(row);
    const fecha = parseDateLongEs(text);
    if (!fecha) continue;

    const resultMatch = text.match(/(\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2})/);
    if (!resultMatch) continue;

    const regulares = (resultMatch[1].match(/\d{1,2}/g) ?? []).map(Number).sort((a, b) => a - b);
    if (!validarMiloto(regulares)) continue;

    out.set(fecha, { date: fecha, regulares });
  }

  return Array.from(out.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function transformarRegistrosConSb(juego: TipoJuego, sorteos: SorteoConSb[]): SorteoRegistro[] {
  return sorteos.map((s) => ({
    juego,
    fecha: s.date,
    numeros: s.regulares,
    sb: s.sb,
  }));
}

function transformarRegistrosSinSb(juego: TipoJuego, sorteos: SorteoSinSb[]): SorteoRegistro[] {
  return sorteos.map((s) => ({
    juego,
    fecha: s.date,
    numeros: s.regulares,
    sb: null,
  }));
}

async function obtenerUltimaFecha(client: any, juego: TipoJuego): Promise<string | null> {
  const { data, error } = await client
    .from('sorteos')
    .select('fecha')
    .eq('juego', juego)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer última fecha (${juego}): ${error.message}`);
  return data?.fecha ?? null;
}

async function contarSorteos(client: any, juego: TipoJuego): Promise<number> {
  const { count, error } = await client
    .from('sorteos')
    .select('id', { count: 'exact', head: true })
    .eq('juego', juego);

  if (error) throw new Error(`No se pudo contar sorteos (${juego}): ${error.message}`);
  return count ?? 0;
}

async function upsertRegistros(client: any, registros: SorteoRegistro[]): Promise<void> {
  if (registros.length === 0) return;

  const { error } = await client
    .from('sorteos')
    .upsert(registros, { onConflict: 'juego,fecha', ignoreDuplicates: false });

  if (error) throw new Error(`Error al hacer upsert: ${error.message}`);
}

async function procesarActualizacion() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, error: 'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.' },
      { status: 400 },
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const year = new Date().getFullYear();

    const [ultimaBaloto, ultimaMiloto, ultimaPowerball] = await Promise.all([
      obtenerUltimaFecha(supabase, 'baloto'),
      obtenerUltimaFecha(supabase, 'miloto'),
      obtenerUltimaFecha(supabase, 'powerball'),
    ]);

    const [balotoScraped, milotoScraped, powerballScraped] = await Promise.all([
      fetchBalotoIncremental(year),
      fetchMilotoIncremental(),
      fetchPowerballIncremental(year),
    ]);

    const balotoNuevos = balotoScraped.filter((s) => !ultimaBaloto || s.date > ultimaBaloto);
    const milotoNuevos = milotoScraped.filter((s) => !ultimaMiloto || s.date > ultimaMiloto);
    const powerballNuevos = powerballScraped.filter((s) => !ultimaPowerball || s.date > ultimaPowerball);

    await Promise.all([
      upsertRegistros(supabase, transformarRegistrosConSb('baloto', balotoNuevos)),
      upsertRegistros(supabase, transformarRegistrosSinSb('miloto', milotoNuevos)),
      upsertRegistros(supabase, transformarRegistrosConSb('powerball', powerballNuevos)),
    ]);

    const [totalBaloto, totalMiloto, totalPowerball] = await Promise.all([
      contarSorteos(supabase, 'baloto'),
      contarSorteos(supabase, 'miloto'),
      contarSorteos(supabase, 'powerball'),
    ]);

    return NextResponse.json({
      ok: true,
      mensaje: 'Actualización incremental finalizada',
      agregados: {
        baloto: balotoNuevos.length,
        miloto: milotoNuevos.length,
        powerball: powerballNuevos.length,
      },
      totales: {
        baloto: totalBaloto,
        miloto: totalMiloto,
        powerball: totalPowerball,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return procesarActualizacion();
}

export async function POST() {
  return procesarActualizacion();
}
