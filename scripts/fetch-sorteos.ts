/* eslint-disable no-console */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
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

const BALOTO_URL = 'https://resultados-de-loteria.com/baloto/resultados';
const POWERBALL_URL = 'https://resultados-de-loteria.com/powerball/resultados';
const MILOTO_URL = 'https://quecayo.com/miloto/historico';

const BALOTO_CUTOFF = '2017-04-19';
const POWERBALL_CUTOFF = '2015-10-04';

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

function parseDateCompactEs(text: string): { iso: string; raw: string } | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const re = /(\d{1,2})\s*([a-záéíóúñ\.]+)\s*(\d{4})/i;
  const match = normalized.match(re);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const monthToken = match[2].replace(/[\.]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const year = match[3];
  const month = monthMap[monthToken];
  if (!month) return null;

  return { iso: `${year}-${month}-${day}`, raw: match[0] };
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

function isValidBalotoCurrent(numbers: number[]): boolean {
  if (numbers.length < 6) return false;
  const regulares = numbers.slice(0, 5);
  const sb = numbers[5];
  return regulares.every((n) => n >= 1 && n <= 43) && isUniqueFive(regulares) && sb >= 1 && sb <= 16;
}

function isValidPowerballCurrent(numbers: number[]): boolean {
  if (numbers.length < 6) return false;
  const regulares = numbers.slice(0, 5);
  const sb = numbers[5];
  return regulares.every((n) => n >= 1 && n <= 69) && isUniqueFive(regulares) && sb >= 1 && sb <= 26;
}

function isValidMiloto(numbers: number[]): boolean {
  return numbers.length === 5 && numbers.every((n) => n >= 1 && n <= 39) && isUniqueFive(numbers);
}

async function fetchYearRows(baseUrl: string, year: number): Promise<string[]> {
  const url = `${baseUrl}/${year}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LotoAnalyzer/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} en ${url}`);
  }

  const html = await res.text();
  return extractRows(html);
}

function summarize<T extends { date: string }>(name: string, data: T[]): void {
  if (!data.length) {
    console.log(`${name}: 0 sorteos`);
    return;
  }

  console.log(
    `${name}: ${data.length} sorteos (${data[0].date} → ${data[data.length - 1].date})`,
  );
}

async function fetchBaloto(): Promise<SorteoConSb[]> {
  const output = new Map<string, SorteoConSb>();

  for (let year = 2017; year <= 2026; year++) {
    const rows = await fetchYearRows(BALOTO_URL, year);

    for (const row of rows) {
      const text = stripHtml(row);
      const parsedDate = parseDateCompactEs(text);
      if (!parsedDate) continue;
      if (parsedDate.iso < BALOTO_CUTOFF) continue;

      const numbersText = text.replace(parsedDate.raw, ' ');
      const numbers = (numbersText.match(/\d+/g) ?? []).map((v) => Number(v));
      if (!isValidBalotoCurrent(numbers)) continue;

      const entry: SorteoConSb = {
        date: parsedDate.iso,
        regulares: numbers.slice(0, 5).sort((a, b) => a - b),
        sb: numbers[5],
      };
      output.set(entry.date, entry);
    }
  }

  return Array.from(output.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchPowerball(): Promise<SorteoConSb[]> {
  const output = new Map<string, SorteoConSb>();

  for (let year = 2015; year <= 2026; year++) {
    const rows = await fetchYearRows(POWERBALL_URL, year);

    for (const row of rows) {
      const text = stripHtml(row);
      const parsedDate = parseDateCompactEs(text);
      if (!parsedDate) continue;
      if (parsedDate.iso < POWERBALL_CUTOFF) continue;

      const numbersText = text.replace(parsedDate.raw, ' ');
      const numbers = (numbersText.match(/\d+/g) ?? []).map((v) => Number(v));
      if (!isValidPowerballCurrent(numbers)) continue;

      const entry: SorteoConSb = {
        date: parsedDate.iso,
        regulares: numbers.slice(0, 5).sort((a, b) => a - b),
        sb: numbers[5],
      };
      output.set(entry.date, entry);
    }
  }

  return Array.from(output.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchMiloto(): Promise<SorteoSinSb[]> {
  const output = new Map<string, SorteoSinSb>();

  for (let page = 1; page <= 31; page++) {
    const url = `${MILOTO_URL}?page=${page}`;
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LotoAnalyzer/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status} en ${url}`);
    }

    const html = await res.text();
    const rows = extractRows(html);

    for (const row of rows) {
      const text = stripHtml(row);
      const date = parseDateLongEs(text);
      if (!date) continue;

      const resultMatch = text.match(/(\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2})/);
      if (!resultMatch) continue;

      const numbers = (resultMatch[1].match(/\d{1,2}/g) ?? []).map((v) => Number(v));
      if (!isValidMiloto(numbers)) continue;

      output.set(date, { date, regulares: numbers.sort((a, b) => a - b) });
    }
  }

  return Array.from(output.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function construirRegistros(
  baloto: SorteoConSb[],
  powerball: SorteoConSb[],
  miloto: SorteoSinSb[],
): SorteoRegistro[] {
  const balotoRows: SorteoRegistro[] = baloto.map((s) => ({
    juego: 'baloto',
    fecha: s.date,
    numeros: s.regulares,
    sb: s.sb,
  }));

  const powerballRows: SorteoRegistro[] = powerball.map((s) => ({
    juego: 'powerball',
    fecha: s.date,
    numeros: s.regulares,
    sb: s.sb,
  }));

  const milotoRows: SorteoRegistro[] = miloto.map((s) => ({
    juego: 'miloto',
    fecha: s.date,
    numeros: s.regulares,
    sb: null,
  }));

  return [...balotoRows, ...powerballRows, ...milotoRows];
}

async function upsertSupabase(registros: SorteoRegistro[]): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('Supabase no configurado. Se actualizaron solo los JSON locales.');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const chunkSize = 500;
  for (let i = 0; i < registros.length; i += chunkSize) {
    const chunk = registros.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('sorteos')
      .upsert(chunk, { onConflict: 'juego,fecha', ignoreDuplicates: false });

    if (error) {
      throw new Error(`Error en upsert a Supabase: ${error.message}`);
    }
  }

  console.log(`Supabase actualizada con ${registros.length.toLocaleString('es-CO')} registros.`);
}

async function main() {
  const base = process.cwd();
  const balotoPath = path.join(base, 'public', 'data', 'baloto.json');
  const powerballPath = path.join(base, 'public', 'data', 'powerball.json');
  const milotoPath = path.join(base, 'public', 'data', 'miloto.json');

  console.log('Descargando históricos...');
  const [baloto, powerball, miloto] = await Promise.all([
    fetchBaloto(),
    fetchPowerball(),
    fetchMiloto(),
  ]);

  await writeFile(balotoPath, JSON.stringify(baloto), 'utf8');
  await writeFile(powerballPath, JSON.stringify(powerball), 'utf8');
  await writeFile(milotoPath, JSON.stringify(miloto), 'utf8');

  console.log('Archivos actualizados en public/data/');
  summarize('Baloto', baloto);
  summarize('Powerball', powerball);
  summarize('MiLoto', miloto);

  const registros = construirRegistros(baloto, powerball, miloto);
  await upsertSupabase(registros);
}

main().catch((error) => {
  console.error('Error en actualización de sorteos:', error);
  process.exit(1);
});
