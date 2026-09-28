/* eslint-disable no-console */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { TipoJuego } from '@/lib/types';

type SorteoJson = {
  date: string;
  regulares: number[];
  sb?: number;
};

type SorteoRegistro = {
  juego: TipoJuego;
  fecha: string;
  numeros: number[];
  sb: number | null;
};

async function leerJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function construirRegistros(juego: TipoJuego, data: SorteoJson[]): SorteoRegistro[] {
  return data.map((item) => ({
    juego,
    fecha: item.date,
    numeros: item.regulares,
    sb: item.sb ?? null,
  }));
}

async function upsertMasivo(registros: SorteoRegistro[]): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.');
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
      throw new Error(`Error de upsert en lote ${i / chunkSize + 1}: ${error.message}`);
    }
  }
}

async function contarPorJuego(juego: TipoJuego): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return 0;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { count, error } = await supabase
    .from('sorteos')
    .select('id', { count: 'exact', head: true })
    .eq('juego', juego);

  if (error) throw new Error(`No se pudo contar ${juego}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const base = process.cwd();
  const balotoPath = path.join(base, 'public', 'data', 'baloto.json');
  const powerballPath = path.join(base, 'public', 'data', 'powerball.json');
  const milotoPath = path.join(base, 'public', 'data', 'miloto.json');

  console.log('Leyendo archivos locales para seed...');
  const [baloto, powerball, miloto] = await Promise.all([
    leerJson<SorteoJson[]>(balotoPath),
    leerJson<SorteoJson[]>(powerballPath),
    leerJson<SorteoJson[]>(milotoPath),
  ]);

  const registros = [
    ...construirRegistros('baloto', baloto),
    ...construirRegistros('powerball', powerball),
    ...construirRegistros('miloto', miloto),
  ];

  console.log(`Enviando ${registros.length.toLocaleString('es-CO')} registros a Supabase...`);
  await upsertMasivo(registros);

  const [countBaloto, countPowerball, countMiloto] = await Promise.all([
    contarPorJuego('baloto'),
    contarPorJuego('powerball'),
    contarPorJuego('miloto'),
  ]);

  console.log('Seed completado. Totales en Supabase:');
  console.log(`- Baloto: ${countBaloto.toLocaleString('es-CO')}`);
  console.log(`- Powerball: ${countPowerball.toLocaleString('es-CO')}`);
  console.log(`- MiLoto: ${countMiloto.toLocaleString('es-CO')}`);
}

main().catch((error) => {
  console.error('Error en seed-supabase:', error);
  process.exit(1);
});
