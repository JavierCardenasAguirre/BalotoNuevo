/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { generarJugadasDeterministas, type SorteoInput } from '@/lib/analisis-probabilistico';
import type { SorteoJSON } from '@/lib/types';

async function loadHistory(file: string): Promise<SorteoInput[]> {
  const raw = await readFile(path.join(process.cwd(), 'public', 'data', file), 'utf8');
  const data = JSON.parse(raw) as SorteoJSON[];
  return data.map((x) => ({ date: x.date, regulares: x.regulares, superbalota: x.sb })).sort((a,b)=>a.date.localeCompare(b.date));
}

async function main() {
  for (const [file, juego] of [['baloto.json','baloto'],['miloto.json','miloto'],['powerball.json','powerball']] as const) {
    const history = await loadHistory(file);
    const jugadas = generarJugadasDeterministas(history, juego);
    console.log(`\n=== ${juego.toUpperCase()} (último sorteo: ${history[history.length-1].date}) ===`);
    jugadas.forEach((j, i) => {
      const nums = j.nums.map(n => String(n).padStart(2,'0')).join(' - ');
      console.log(`  Jugada ${i+1}: ${nums}${j.sb ? '  |  SB: ' + String(j.sb).padStart(2,'0') : ''}`);
    });
  }
}
main();
