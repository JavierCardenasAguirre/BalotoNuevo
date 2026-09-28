/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analizarProbabilistico,
  calcularAciertosDeJugada,
  generarJugadasDeterministas,
  validarJugadasDisjuntas,
  type JugadaPersistida,
  type SorteoInput,
} from '@/lib/analisis-probabilistico';
import type { SorteoJSON } from '@/lib/types';

function normalizeBaloto(data: SorteoJSON[]): SorteoInput[] {
  return data
    .map((x) => ({ date: x.date, regulares: x.regulares, superbalota: x.sb }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function loadBalotoHistory(): Promise<SorteoInput[]> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'baloto.json');
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as SorteoJSON[];
  return normalizeBaloto(parsed);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function fixtureAciertosBaloto() {
  const jugadas: JugadaPersistida[] = [
    { nums: [5, 14, 18, 29, 32], sb: 3 },
    { nums: [5, 10, 15, 23, 32], sb: 3 },
    { nums: [4, 15, 18, 23, 32], sb: 11 },
    { nums: [8, 12, 16, 23, 32], sb: 13 },
    { nums: [3, 9, 22, 32, 39], sb: 9 },
    { nums: [8, 10, 13, 29, 32], sb: 10 },
  ];

  const resultado: SorteoInput = {
    date: '2026-09-26',
    regulares: [11, 15, 16, 20, 36],
    superbalota: 12,
  };

  const aciertos = jugadas.map((j) => calcularAciertosDeJugada(j, resultado, true));
  const total = aciertos.reduce((acc, item) => acc + item.hits, 0);

  const expectedHits = [0, 1, 1, 1, 0, 0];
  assert(total === 3, `Fixture incorrecto: total_aciertos esperado 3, recibido ${total}`);
  assert(aciertos.every((a, idx) => a.hits === expectedHits[idx]), 'Fixture incorrecto: hits por jugada no coincide');
  assert(aciertos.every((a) => a.sb_ok === false), 'Fixture incorrecto: sb_ok debe ser false en todas');

  console.log('✅ Fixture de aciertos validado: total_aciertos=3');
}

async function main() {
  const historial = await loadBalotoHistory();

  const r1 = analizarProbabilistico(historial, 'baloto');
  const r2 = analizarProbabilistico(historial, 'baloto');
  const r3 = analizarProbabilistico(historial, 'baloto');

  const j1 = JSON.stringify(r1.recomendaciones);
  const j2 = JSON.stringify(r2.recomendaciones);
  const j3 = JSON.stringify(r3.recomendaciones);

  assert(j1 === j2 && j2 === j3, 'Determinismo falló: 3 llamadas no dieron jugadas idénticas');
  console.log('✅ Determinismo validado: 3 llamadas consecutivas idénticas');

  const jugadasDet = generarJugadasDeterministas(historial, 'baloto');
  const validacion = validarJugadasDisjuntas(jugadasDet);
  assert(validacion.esDisjunta, `Disjunción falló: números repetidos ${validacion.repetidos.join(', ')}`);
  assert(new Set(jugadasDet.flatMap((j) => j.nums)).size === 30, 'Disjunción falló: no cubre 30 números distintos');
  console.log('✅ Disjunción validada: 6 jugadas sin repetición y 30 números distintos');

  fixtureAciertosBaloto();
  console.log('\n🎉 Todas las pruebas críticas pasaron.');
}

main().catch((error) => {
  console.error('❌ Fallo en test-jugadas:', error.message);
  process.exit(1);
});
