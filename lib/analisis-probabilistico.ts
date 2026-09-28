import {
  type AciertoJugada,
  type ChiCuadradoMetrica,
  type CoocurrenciaMetrica,
  type JuegoConfig,
  type JugadaPersistida,
  type JugadaRecomendada,
  type NumeroMetrica,
  type ParidadMetrica,
  type ProbabilidadPremio,
  type RangoMetrica,
  type ResultadoAnalisis,
  type SorteoInput,
  type TipoJuego,
} from './types';

export type { ResultadoAnalisis, TipoJuego, SorteoInput, JugadaPersistida, AciertoJugada };

export const CONFIG_JUEGO: Record<TipoJuego, JuegoConfig> = {
  miloto: { nombre: 'MiLoto', maxRegular: 39, usaSuperbalota: false, sbMax: 0, sbNombre: '' },
  baloto: { nombre: 'Baloto', maxRegular: 43, usaSuperbalota: true, sbMax: 16, sbNombre: 'Superbalota' },
  powerball: { nombre: 'Powerball', maxRegular: 69, usaSuperbalota: true, sbMax: 26, sbNombre: 'Powerball' },
};

const TOTAL_RECOMENDACIONES = 6;
const NUMEROS_POR_JUGADA = 5;
const TAM_POOL_DISJUNTO = TOTAL_RECOMENDACIONES * NUMEROS_POR_JUGADA;

function combinaciones(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const m = Math.min(k, n - k);
  let numerador = 1;
  let denominador = 1;
  for (let i = 1; i <= m; i++) {
    numerador *= n - m + i;
    denominador *= i;
  }
  return Math.round(numerador / denominador);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function nextHash() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return function prng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYatesDeterminista(values: number[], rnd: () => number): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function construirSemillaDeterministica(juego: TipoJuego, ultimoSorteo: SorteoInput): string {
  const base = [
    juego,
    ultimoSorteo.date,
    ...(ultimoSorteo.regulares ?? []).map((n) => String(n)),
  ];

  if (ultimoSorteo.superbalota !== undefined) {
    base.push(String(ultimoSorteo.superbalota));
  }

  return base.join('|');
}

function buildRangos(maxRegular: number): Array<{ desde: number; hasta: number; etiqueta: string }> {
  if (maxRegular <= 40) {
    return [
      { desde: 1, hasta: 10, etiqueta: '1-10' },
      { desde: 11, hasta: 20, etiqueta: '11-20' },
      { desde: 21, hasta: 30, etiqueta: '21-30' },
      { desde: 31, hasta: maxRegular, etiqueta: `31-${maxRegular}` },
    ];
  }

  if (maxRegular <= 50) {
    return [
      { desde: 1, hasta: 10, etiqueta: '1-10' },
      { desde: 11, hasta: 20, etiqueta: '11-20' },
      { desde: 21, hasta: 30, etiqueta: '21-30' },
      { desde: 31, hasta: 40, etiqueta: '31-40' },
      { desde: 41, hasta: maxRegular, etiqueta: `41-${maxRegular}` },
    ];
  }

  return [
    { desde: 1, hasta: 10, etiqueta: '1-10' },
    { desde: 11, hasta: 20, etiqueta: '11-20' },
    { desde: 21, hasta: 30, etiqueta: '21-30' },
    { desde: 31, hasta: 40, etiqueta: '31-40' },
    { desde: 41, hasta: 50, etiqueta: '41-50' },
    { desde: 51, hasta: 60, etiqueta: '51-60' },
    { desde: 61, hasta: maxRegular, etiqueta: `61-${maxRegular}` },
  ];
}

function evaluarPopularidad(regulares: number[]): { riesgo: number; indiceImpopularidad: number; razones: string[] } {
  const sorted = [...regulares].sort((a, b) => a - b);
  const bajo31 = sorted.filter((n) => n <= 31).length;

  let consecutivos = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) consecutivos += 1;
  }

  const decenas = new Map<number, number>();
  sorted.forEach((n) => {
    const key = Math.floor((n - 1) / 10);
    decenas.set(key, (decenas.get(key) ?? 0) + 1);
  });
  const maxMismaDecena = Math.max(...Array.from(decenas.values()));

  const suma = sorted.reduce((acc, n) => acc + n, 0);
  const diasMes = sorted.filter((n) => n <= 12).length;

  let riesgo = 0;
  const razones: string[] = [];

  const riesgoCumpleanhos = (bajo31 / sorted.length) * 45;
  riesgo += riesgoCumpleanhos;
  if (bajo31 >= 4) razones.push('Muchos números de 1-31 (patrón típico de cumpleaños).');

  if (consecutivos >= 2) {
    riesgo += 18;
    razones.push('Tiene varios números consecutivos visibles.');
  } else if (consecutivos === 1) {
    riesgo += 8;
  }

  if (maxMismaDecena >= 3) {
    riesgo += 14;
    razones.push('Concentración alta en la misma decena.');
  }

  if (diasMes >= 3) {
    riesgo += 10;
    razones.push('Incluye demasiados números bajos (1-12).');
  }

  if (suma < 85) riesgo += 8;
  if (suma > 185) riesgo += 5;

  const riesgoFinal = clamp(riesgo, 0, 100);
  const indiceImpopularidad = 100 - riesgoFinal;

  if (razones.length === 0) {
    razones.push('Distribución menos común: ayuda a reducir probabilidad de premio compartido.');
  }

  return {
    riesgo: Number(riesgoFinal.toFixed(1)),
    indiceImpopularidad: Number(indiceImpopularidad.toFixed(1)),
    razones,
  };
}

function chiCuadrado(frecuencias: number[], esperado: number): ChiCuadradoMetrica {
  const valor = frecuencias.reduce((acc, observada) => {
    if (esperado <= 0) return acc;
    const diff = observada - esperado;
    return acc + (diff * diff) / esperado;
  }, 0);

  const gradosLibertad = Math.max(1, frecuencias.length - 1);
  const razonChiGl = valor / gradosLibertad;

  let interpretacion = 'Variación dentro de lo esperable para un juego aleatorio.';
  if (razonChiGl > 1.6) {
    interpretacion = 'Hay dispersión mayor al promedio, pero no implica predictibilidad futura.';
  } else if (razonChiGl < 0.6) {
    interpretacion = 'La distribución luce más homogénea de lo habitual en este corte histórico.';
  }

  return {
    valor: Number(valor.toFixed(2)),
    gradosLibertad,
    esperadoPorNumero: Number(esperado.toFixed(3)),
    razonChiGl: Number(razonChiGl.toFixed(3)),
    interpretacion,
  };
}

function normalizarSorteos(sorteos: SorteoInput[], config: JuegoConfig): SorteoInput[] {
  return (sorteos ?? [])
    .map((s) => ({
      date: s.date,
      regulares: (s.regulares ?? [])
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= config.maxRegular)
        .sort((a, b) => a - b),
      superbalota: config.usaSuperbalota && s.superbalota ? s.superbalota : undefined,
    }))
    .filter((s) => s.regulares.length === 5)
    .filter((s) => {
      if (!config.usaSuperbalota) return true;
      return (s.superbalota ?? 0) >= 1 && (s.superbalota ?? 0) <= config.sbMax;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function construirTablaProbabilidades(juego: TipoJuego): ProbabilidadPremio[] {
  const config = CONFIG_JUEGO[juego];
  const totalRegulares = combinaciones(config.maxRegular, NUMEROS_POR_JUGADA);

  const addRow = (categoria: string, aciertos: string, ways: number) => ({
    categoria,
    aciertos,
    probabilidad: ways / (config.usaSuperbalota ? totalRegulares * config.sbMax : totalRegulares),
    texto: `1 en ${Math.round((config.usaSuperbalota ? totalRegulares * config.sbMax : totalRegulares) / ways).toLocaleString('es-CO')}`,
  });

  if (juego === 'miloto') {
    return [
      addRow('Premio mayor', '5', 1),
      addRow('Premio', '4', combinaciones(5, 4) * combinaciones(34, 1)),
      addRow('Premio', '3', combinaciones(5, 3) * combinaciones(34, 2)),
      addRow('Premio base', '2', combinaciones(5, 2) * combinaciones(34, 3)),
    ];
  }

  const sbMax = config.sbMax;
  const ways = (k: number) => combinaciones(5, k) * combinaciones(config.maxRegular - 5, 5 - k);

  const rows: ProbabilidadPremio[] = [
    addRow('Premio mayor', `5 + ${config.sbNombre}`, 1),
    addRow('Premio', '5', sbMax - 1),
    addRow('Premio', `4 + ${config.sbNombre}`, ways(4)),
    addRow('Premio', '4', ways(4) * (sbMax - 1)),
    addRow('Premio', `3 + ${config.sbNombre}`, ways(3)),
    addRow('Premio', '3', ways(3) * (sbMax - 1)),
  ];

  if (juego === 'powerball') {
    rows.push(
      addRow('Premio menor', `2 + ${config.sbNombre}`, ways(2)),
      addRow('Premio menor', `1 + ${config.sbNombre}`, ways(1)),
      addRow('Premio menor', `0 + ${config.sbNombre}`, ways(0)),
    );
  }

  return rows;
}

function convertirRecomendacionesAPersistidas(recomendaciones: JugadaRecomendada[]): JugadaPersistida[] {
  return recomendaciones.map((r) => ({ nums: [...r.regulares], sb: r.superbalota ?? null }));
}

function fromPersistidasAPuntaje(persistidas: JugadaPersistida[], juego: TipoJuego): JugadaRecomendada[] {
  return persistidas.map((j, idx) => {
    const popularidad = evaluarPopularidad(j.nums);
    return {
      id: idx + 1,
      regulares: [...j.nums].sort((a, b) => a - b),
      superbalota: CONFIG_JUEGO[juego].usaSuperbalota ? (j.sb ?? undefined) : undefined,
      puntaje: 0,
      indiceImpopularidad: popularidad.indiceImpopularidad,
      riesgoPopularidad: popularidad.riesgo,
      razones: popularidad.razones,
    };
  });
}

export function calcularAciertosDeJugada(
  jugada: JugadaPersistida,
  resultado: SorteoInput,
  usaSuperbalota: boolean,
): AciertoJugada {
  const setResultado = new Set(resultado.regulares);
  const hits = jugada.nums.reduce((acc, n) => acc + (setResultado.has(n) ? 1 : 0), 0);
  const sb_ok = usaSuperbalota && jugada.sb !== null
    ? jugada.sb === (resultado.superbalota ?? null)
    : false;

  return { hits, sb_ok };
}

export function validarJugadasDisjuntas(jugadas: JugadaPersistida[]): { esDisjunta: boolean; repetidos: number[] } {
  const seen = new Set<number>();
  const repetidos = new Set<number>();
  for (const jugada of jugadas) {
    for (const n of jugada.nums) {
      if (seen.has(n)) repetidos.add(n);
      seen.add(n);
    }
  }

  return { esDisjunta: repetidos.size === 0, repetidos: Array.from(repetidos).sort((a, b) => a - b) };
}

export function generarJugadasDeterministas(sorteosEntrada: SorteoInput[], juego: TipoJuego): JugadaPersistida[] {
  const config = CONFIG_JUEGO[juego];
  const sorteos = normalizarSorteos(sorteosEntrada, config);
  if (!sorteos.length) throw new Error('No hay sorteos válidos para generar jugadas.');

  const totalSorteos = sorteos.length;
  const frecuenciaRegular = Array.from({ length: config.maxRegular + 1 }, () => 0);
  const ultimaAparicion = Array.from({ length: config.maxRegular + 1 }, () => -1);
  const frecuenciaSb = Array.from({ length: config.sbMax + 1 }, () => 0);
  const ultimaAparicionSb = Array.from({ length: config.sbMax + 1 }, () => -1);

  sorteos.forEach((s, idx) => {
    s.regulares.forEach((n) => {
      frecuenciaRegular[n] += 1;
      ultimaAparicion[n] = idx;
    });
    if (config.usaSuperbalota) {
      const sb = s.superbalota ?? 0;
      if (sb >= 1 && sb <= config.sbMax) {
        frecuenciaSb[sb] += 1;
        ultimaAparicionSb[sb] = idx;
      }
    }
  });

  const maxAusencia = Math.max(...ultimaAparicion.slice(1).map((last) => (last === -1 ? totalSorteos : totalSorteos - 1 - last)));

  const ultimoSorteo = sorteos[sorteos.length - 1];
  const semilla = construirSemillaDeterministica(juego, ultimoSorteo);
  const hash = xmur3(semilla);
  const rnd = mulberry32(hash());

  const rankingRegulares = Array.from({ length: config.maxRegular }, (_, i) => {
    const numero = i + 1;
    const freq = frecuenciaRegular[numero];
    const ausencia = ultimaAparicion[numero] === -1 ? totalSorteos : totalSorteos - 1 - ultimaAparicion[numero];
    const scoreFreq = freq / Math.max(1, totalSorteos);
    const scoreAusencia = ausencia / Math.max(1, maxAusencia);

    const decade = Math.floor((numero - 1) / 10);
    const paridadBonus = numero % 2 === 0 ? 0.015 : 0.01;
    const decadeBonus = (decade % 2 === 0 ? 0.006 : 0.004);

    const score = scoreFreq * 0.58 + scoreAusencia * 0.36 + paridadBonus + decadeBonus;
    const jitter = rnd() * 0.000001;

    return { numero, score: score + jitter };
  })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.numero);

  const pool = rankingRegulares.slice(0, Math.min(TAM_POOL_DISJUNTO, config.maxRegular));
  const poolBarajado = fisherYatesDeterminista(pool, rnd);

  const jugadas: JugadaPersistida[] = [];
  for (let i = 0; i < TOTAL_RECOMENDACIONES; i++) {
    const chunk = poolBarajado.slice(i * NUMEROS_POR_JUGADA, (i + 1) * NUMEROS_POR_JUGADA).sort((a, b) => a - b);
    jugadas.push({ nums: chunk, sb: null });
  }

  if (config.usaSuperbalota) {
    const maxAusenciaSb = Math.max(...ultimaAparicionSb.slice(1).map((last) => (last === -1 ? totalSorteos : totalSorteos - 1 - last)));
    const rankingSb = Array.from({ length: config.sbMax }, (_, i) => {
      const numero = i + 1;
      const freq = frecuenciaSb[numero];
      const ausencia = ultimaAparicionSb[numero] === -1 ? totalSorteos : totalSorteos - 1 - ultimaAparicionSb[numero];
      const score = (freq / Math.max(1, totalSorteos)) * 0.55 + (ausencia / Math.max(1, maxAusenciaSb)) * 0.45 + rnd() * 0.000001;
      return { numero, score };
    })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.numero);

    const mejoresSeisSb = fisherYatesDeterminista(rankingSb.slice(0, TOTAL_RECOMENDACIONES), rnd);
    jugadas.forEach((j, idx) => {
      j.sb = mejoresSeisSb[idx] ?? null;
    });
  }

  return jugadas;
}

export function analizarProbabilistico(
  sorteosEntrada: SorteoInput[],
  juego: TipoJuego,
  jugadasPersistidas?: JugadaPersistida[] | null,
): ResultadoAnalisis {
  const config = CONFIG_JUEGO[juego];
  const sorteos = normalizarSorteos(sorteosEntrada, config);

  if (!sorteos.length) throw new Error('No hay sorteos válidos para analizar');

  const totalSorteos = sorteos.length;
  const totalPicksRegulares = totalSorteos * NUMEROS_POR_JUGADA;

  const frecuenciaRegular = Array.from({ length: config.maxRegular + 1 }, () => 0);
  const ultimaAparicion = Array.from({ length: config.maxRegular + 1 }, () => -1);
  const frecuenciaSb = Array.from({ length: config.sbMax + 1 }, () => 0);
  const ultimaAparicionSb = Array.from({ length: config.sbMax + 1 }, () => -1);

  const pairCounter = new Map<string, number>();
  const sumas: number[] = [];
  const paridadConteo = new Map<string, number>();

  sorteos.forEach((sorteo, idx) => {
    const nums = [...sorteo.regulares].sort((a, b) => a - b);

    let pares = 0;
    nums.forEach((n) => {
      frecuenciaRegular[n] += 1;
      ultimaAparicion[n] = idx;
      if (n % 2 === 0) pares += 1;
    });

    const impares = 5 - pares;
    const keyParidad = `${pares}P-${impares}I`;
    paridadConteo.set(keyParidad, (paridadConteo.get(keyParidad) ?? 0) + 1);

    sumas.push(nums.reduce((acc, n) => acc + n, 0));

    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${nums[i]}-${nums[j]}`;
        pairCounter.set(key, (pairCounter.get(key) ?? 0) + 1);
      }
    }

    if (config.usaSuperbalota) {
      const sb = sorteo.superbalota ?? 0;
      if (sb >= 1 && sb <= config.sbMax) {
        frecuenciaSb[sb] += 1;
        ultimaAparicionSb[sb] = idx;
      }
    }
  });

  const maxAusencia = Math.max(...ultimaAparicion.slice(1).map((last) => (last === -1 ? totalSorteos : totalSorteos - 1 - last)));

  const metricasRegulares: NumeroMetrica[] = Array.from({ length: config.maxRegular }, (_, i) => {
    const numero = i + 1;
    const frecuencia = frecuenciaRegular[numero];
    const ausencia = ultimaAparicion[numero] === -1 ? totalSorteos : totalSorteos - 1 - ultimaAparicion[numero];
    const frecuenciaNorm = frecuencia / Math.max(1, totalSorteos);
    const recenciaNorm = 1 - ausencia / Math.max(1, maxAusencia);
    const puntaje = frecuenciaNorm * 0.65 + recenciaNorm * 0.35;

    return {
      numero,
      frecuencia,
      porcentajeSorteos: Number(((frecuencia / totalSorteos) * 100).toFixed(2)),
      sorteosDesdeUltimaAparicion: ausencia,
      ultimaFecha: ultimaAparicion[numero] >= 0 ? sorteos[ultimaAparicion[numero]].date : null,
      puntaje: Number(puntaje.toFixed(6)),
    };
  });

  const metricasSb: NumeroMetrica[] = config.usaSuperbalota
    ? Array.from({ length: config.sbMax }, (_, i) => {
        const numero = i + 1;
        const frecuencia = frecuenciaSb[numero];
        const ausencia = ultimaAparicionSb[numero] === -1 ? totalSorteos : totalSorteos - 1 - ultimaAparicionSb[numero];
        const maxAusenciaSb = Math.max(...ultimaAparicionSb.slice(1).map((last) => (last === -1 ? totalSorteos : totalSorteos - 1 - last)));
        const frecuenciaNorm = frecuencia / Math.max(1, totalSorteos);
        const recenciaNorm = 1 - ausencia / Math.max(1, maxAusenciaSb);
        const puntaje = frecuenciaNorm * 0.62 + recenciaNorm * 0.38;

        return {
          numero,
          frecuencia,
          porcentajeSorteos: Number(((frecuencia / totalSorteos) * 100).toFixed(2)),
          sorteosDesdeUltimaAparicion: ausencia,
          ultimaFecha: ultimaAparicionSb[numero] >= 0 ? sorteos[ultimaAparicionSb[numero]].date : null,
          puntaje: Number(puntaje.toFixed(6)),
        };
      })
    : [];

  const rangos = buildRangos(config.maxRegular);
  const totalNumerosObservados = totalSorteos * NUMEROS_POR_JUGADA;
  const distribucionRangos: RangoMetrica[] = rangos.map((rango) => {
    let apariciones = 0;
    for (let n = rango.desde; n <= rango.hasta; n++) {
      apariciones += frecuenciaRegular[n] ?? 0;
    }
    return {
      etiqueta: rango.etiqueta,
      desde: rango.desde,
      hasta: rango.hasta,
      apariciones,
      porcentaje: Number(((apariciones / Math.max(1, totalNumerosObservados)) * 100).toFixed(2)),
    };
  });

  const distribucionParidad: ParidadMetrica[] = Array.from(paridadConteo.entries())
    .map(([etiqueta, conteo]) => ({
      etiqueta,
      sorteos: conteo,
      porcentaje: Number(((conteo / totalSorteos) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.sorteos - a.sorteos);

  const coocurrenciasTop: CoocurrenciaMetrica[] = Array.from(pairCounter.entries())
    .map(([key, frecuencia]) => {
      const [a, b] = key.split('-').map(Number);
      return { numeros: [a, b] as [number, number], frecuencia };
    })
    .sort((a, b) => b.frecuencia - a.frecuencia)
    .slice(0, 12);

  const topCalientes = [...metricasRegulares]
    .sort((a, b) => b.puntaje - a.puntaje || b.frecuencia - a.frecuencia || a.numero - b.numero)
    .slice(0, 12);

  const topFrios = [...metricasRegulares]
    .sort((a, b) => a.frecuencia - b.frecuencia || b.sorteosDesdeUltimaAparicion - a.sorteosDesdeUltimaAparicion || a.numero - b.numero)
    .slice(0, 12);

  const rachasAusencia = [...metricasRegulares]
    .sort((a, b) => b.sorteosDesdeUltimaAparicion - a.sorteosDesdeUltimaAparicion || a.numero - b.numero)
    .slice(0, 12);

  const chi = chiCuadrado(frecuenciaRegular.slice(1), totalPicksRegulares / config.maxRegular);

  const estadisticasSuma = {
    promedio: Number(mean(sumas).toFixed(2)),
    minimo: Math.min(...sumas),
    maximo: Math.max(...sumas),
    p10: percentile(sumas, 0.1),
    p90: percentile(sumas, 0.9),
  };

  const semillaDeterministica = construirSemillaDeterministica(juego, sorteos[sorteos.length - 1]);
  const jugadasBase = jugadasPersistidas && jugadasPersistidas.length === TOTAL_RECOMENDACIONES
    ? jugadasPersistidas
    : generarJugadasDeterministas(sorteos, juego);

  const recomendaciones = fromPersistidasAPuntaje(jugadasBase, juego);
  const poolDisjunto = Array.from(new Set(jugadasBase.flatMap((j) => j.nums))).sort((a, b) => a - b);

  const totalCombinacionesBase = combinaciones(config.maxRegular, NUMEROS_POR_JUGADA);
  const totalCombinaciones = config.usaSuperbalota ? totalCombinacionesBase * config.sbMax : totalCombinacionesBase;

  return {
    juego,
    nombreJuego: config.nombre,
    totalSorteos,
    fechaInicial: sorteos[0].date,
    fechaFinal: sorteos[totalSorteos - 1].date,
    ultimoSorteo: sorteos[totalSorteos - 1],
    usaSuperbalota: config.usaSuperbalota,
    sbNombre: config.sbNombre,
    totalCombinaciones,
    probabilidadTexto: `1 en ${totalCombinaciones.toLocaleString('es-CO')}`,
    notaHonestidad:
      'Las jugadas se mantienen fijas hasta el próximo sorteo. Ninguna estrategia cambia la probabilidad de acertar; el beneficio aquí es maximizar cobertura y reducir riesgo de premio compartido.',
    semillaDeterministica,
    poolDisjunto,
    coberturaDisjunta: Number(((poolDisjunto.length / config.maxRegular) * 100).toFixed(2)),
    numerosCalientes: topCalientes,
    numerosFrios: topFrios,
    rachasAusencia,
    superbalotasCalientes: metricasSb.slice(0, 8),
    superbalotasFrias: [...metricasSb]
      .sort((a, b) => a.frecuencia - b.frecuencia || b.sorteosDesdeUltimaAparicion - a.sorteosDesdeUltimaAparicion)
      .slice(0, 8),
    distribucionRangos,
    distribucionParidad,
    estadisticasSuma,
    coocurrenciasTop,
    chiCuadrado: chi,
    recomendaciones,
    tablaProbabilidades: construirTablaProbabilidades(juego),
  };
}

export function convertirResultadoAJugadasPersistidas(resultado: ResultadoAnalisis): JugadaPersistida[] {
  return convertirRecomendacionesAPersistidas(resultado.recomendaciones);
}
