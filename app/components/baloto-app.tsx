'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { DatabaseZap, RotateCcw, Info, RefreshCcw } from 'lucide-react'
import PanelDatos from './panel-datos'
import PanelResultados from './panel-resultados'
import {
  analizarProbabilistico,
  CONFIG_JUEGO,
  calcularAciertosDeJugada,
  convertirResultadoAJugadasPersistidas,
  generarJugadasDeterministas,
  type JugadaPersistida,
  type ResultadoAnalisis,
  type SorteoInput,
  type TipoJuego,
} from '@/lib/analisis-probabilistico'
import type { RendimientoRealItem, SorteoJSON } from '@/lib/types'
import {
  actualizarAciertosPendientes,
  calcularProximaFechaSorteo,
  cargarRendimientoReal,
  cargarSorteosPorJuego,
  cargarUltimosSorteosPorJuego,
  guardarJugadaProgramada,
  obtenerJugadaProgramada,
  supabaseConfigurado,
} from '@/lib/supabase'
import { toast } from 'sonner'

type FuenteDatos = 'supabase' | 'local';

type ResumenActualizacionApi = {
  ok: boolean;
  mensaje: string;
  agregados: Record<TipoJuego, number>;
  totales: Record<TipoJuego, number>;
};

const JUEGOS: TipoJuego[] = ['baloto', 'miloto', 'powerball'];

const FUENTES_VACIAS: Record<TipoJuego, FuenteDatos> = {
  baloto: 'local',
  miloto: 'local',
  powerball: 'local',
};

const ULTIMOS_VACIOS: Record<TipoJuego, SorteoInput[]> = {
  baloto: [],
  miloto: [],
  powerball: [],
};

function normalizarSorteosDesdeJson(data: SorteoJSON[], usaSuperbalota: boolean): SorteoInput[] {
  return (data ?? [])
    .map((item) => ({
      date: item.date,
      regulares: item.regulares ?? [],
      superbalota: usaSuperbalota ? item.sb : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function cargarJsonLocal(targetJuego: TipoJuego): Promise<SorteoInput[]> {
  const cfg = CONFIG_JUEGO[targetJuego];
  const response = await fetch(`/data/${targetJuego}.json`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No se pudo cargar /data/${targetJuego}.json`);
  }

  const raw = (await response.json()) as SorteoJSON[];
  const sorteos = normalizarSorteosDesdeJson(raw, cfg.usaSuperbalota);
  if (sorteos.length === 0) {
    throw new Error(`El archivo local de ${cfg.nombre} está vacío o inválido.`);
  }

  return sorteos;
}

async function cargarJuegoConFallback(targetJuego: TipoJuego): Promise<{ sorteos: SorteoInput[]; fuente: FuenteDatos }> {
  if (supabaseConfigurado()) {
    try {
      const sorteosSupabase = await cargarSorteosPorJuego(targetJuego);
      if (sorteosSupabase && sorteosSupabase.length > 0) {
        return { sorteos: sorteosSupabase, fuente: 'supabase' };
      }
    } catch (error) {
      console.error(`Error consultando Supabase para ${targetJuego}:`, error);
    }
  }

  const sorteosLocales = await cargarJsonLocal(targetJuego);
  return { sorteos: sorteosLocales, fuente: 'local' };
}

async function cargarRecientesConFallback(targetJuego: TipoJuego, limite = 10): Promise<{ sorteos: SorteoInput[]; fuente: FuenteDatos }> {
  if (supabaseConfigurado()) {
    try {
      const recientes = await cargarUltimosSorteosPorJuego(targetJuego, limite);
      if (recientes && recientes.length > 0) {
        return { sorteos: recientes, fuente: 'supabase' };
      }
    } catch (error) {
      console.error(`Error consultando recientes de Supabase para ${targetJuego}:`, error);
    }
  }

  const locales = await cargarJsonLocal(targetJuego);
  return { sorteos: [...locales].slice(-limite).reverse(), fuente: 'local' };
}

function localKeyJugadas(juego: TipoJuego, fecha: string): string {
  return `loto_jugadas_${juego}_${fecha}`;
}

function localKeyRendimiento(juego: TipoJuego): string {
  return `loto_rendimiento_${juego}`;
}

function cargarRendimientoLocal(juego: TipoJuego): RendimientoRealItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(localKeyRendimiento(juego));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RendimientoRealItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function guardarRendimientoLocal(juego: TipoJuego, items: RendimientoRealItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(localKeyRendimiento(juego), JSON.stringify(items));
}

async function resolverJugadasProgramadas(
  juego: TipoJuego,
  historial: SorteoInput[],
): Promise<{ paraFecha: string; jugadas: JugadaPersistida[]; rendimiento: RendimientoRealItem[] }> {
  const paraFecha = calcularProximaFechaSorteo(juego);
  const usaSb = CONFIG_JUEGO[juego].usaSuperbalota;

  if (supabaseConfigurado()) {
    try {
      const existente = await obtenerJugadaProgramada(juego, paraFecha);
      let jugadas: JugadaPersistida[];

      if (existente && existente.jugadas.length === 6) {
        jugadas = existente.jugadas;
      } else {
        jugadas = generarJugadasDeterministas(historial, juego);
        await guardarJugadaProgramada(juego, paraFecha, jugadas);
      }

      await actualizarAciertosPendientes(juego, historial);
      const rendimiento = await cargarRendimientoReal(juego);
      return { paraFecha, jugadas, rendimiento };
    } catch (error) {
      console.error('Fallo flujo Supabase jugadas, activando fallback localStorage:', error);
    }
  }

  let jugadas: JugadaPersistida[] | null = null;
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem(localKeyJugadas(juego, paraFecha));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as JugadaPersistida[];
        if (Array.isArray(parsed) && parsed.length === 6) jugadas = parsed;
      } catch {
        jugadas = null;
      }
    }
  }

  if (!jugadas) {
    jugadas = generarJugadasDeterministas(historial, juego);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(localKeyJugadas(juego, paraFecha), JSON.stringify(jugadas));
    }
  }

  const historialMap = new Map(historial.map((s) => [s.date, s]));
  const items = cargarRendimientoLocal(juego);

  let nextItems = [...items];
  const idxActual = nextItems.findIndex((it) => it.para_fecha === paraFecha);
  if (idxActual === -1) {
    nextItems.unshift({
      juego,
      para_fecha: paraFecha,
      jugadas,
      aciertos: null,
      total_aciertos: null,
      generado_en: new Date().toISOString(),
    });
  }

  nextItems = nextItems.map((it) => {
    if (it.aciertos && it.total_aciertos !== null) return it;
    const sorteo = historialMap.get(it.para_fecha);
    if (!sorteo) return it;

    const aciertos = it.jugadas.map((j) => calcularAciertosDeJugada(j, sorteo, usaSb));
    const total = aciertos.reduce((acc, a) => acc + a.hits, 0);
    return { ...it, aciertos, total_aciertos: total };
  });

  guardarRendimientoLocal(juego, nextItems);
  return { paraFecha, jugadas, rendimiento: nextItems };
}

export default function BalotoApp() {
  const [juego, setJuego] = useState<TipoJuego>('baloto');
  const [historial, setHistorial] = useState<SorteoInput[]>([]);
  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fuenteDatosActual, setFuenteDatosActual] = useState<FuenteDatos>('local');
  const [fuentesPorJuego, setFuentesPorJuego] = useState<Record<TipoJuego, FuenteDatos>>(FUENTES_VACIAS);
  const [ultimosPorJuego, setUltimosPorJuego] = useState<Record<TipoJuego, SorteoInput[]>>(ULTIMOS_VACIOS);
  const [jugadasProgramadas, setJugadasProgramadas] = useState<Record<TipoJuego, JugadaPersistida[]>>({ baloto: [], miloto: [], powerball: [] });
  const [fechaObjetivoPorJuego, setFechaObjetivoPorJuego] = useState<Record<TipoJuego, string>>({ baloto: '', miloto: '', powerball: '' });
  const [rendimientoPorJuego, setRendimientoPorJuego] = useState<Record<TipoJuego, RendimientoRealItem[]>>({ baloto: [], miloto: [], powerball: [] });

  const config = useMemo(() => CONFIG_JUEGO[juego], [juego]);

  const cargarTableroGeneral = useCallback(async (juegoActual: TipoJuego, historialJuegoActual?: SorteoInput[], fuenteActual?: FuenteDatos) => {
    const nuevosUltimos: Record<TipoJuego, SorteoInput[]> = { baloto: [], miloto: [], powerball: [] };
    const nuevasFuentes: Record<TipoJuego, FuenteDatos> = { ...FUENTES_VACIAS };

    for (const g of JUEGOS) {
      if (g === juegoActual && historialJuegoActual && historialJuegoActual.length > 0) {
        nuevosUltimos[g] = [...historialJuegoActual].slice(-10).reverse();
        nuevasFuentes[g] = fuenteActual ?? 'local';
        continue;
      }

      try {
        const { sorteos, fuente } = await cargarRecientesConFallback(g, 10);
        nuevosUltimos[g] = [...sorteos].slice(0, 10);
        nuevasFuentes[g] = fuente;
      } catch (error) {
        console.error(`Error cargando tablero de ${g}:`, error);
      }
    }

    setUltimosPorJuego(nuevosUltimos);
    setFuentesPorJuego(nuevasFuentes);
  }, []);

  const cargarDatos = useCallback(async (targetJuego: TipoJuego, mostrarToast = true) => {
    const cfg = CONFIG_JUEGO[targetJuego];
    setIsLoadingData(true);

    try {
      const { sorteos, fuente } = await cargarJuegoConFallback(targetJuego);
      setHistorial(sorteos);
      setFuenteDatosActual(fuente);

      await cargarTableroGeneral(targetJuego, sorteos, fuente);

      const { paraFecha, jugadas, rendimiento } = await resolverJugadasProgramadas(targetJuego, sorteos);
      setJugadasProgramadas((prev) => ({ ...prev, [targetJuego]: jugadas }));
      setFechaObjetivoPorJuego((prev) => ({ ...prev, [targetJuego]: paraFecha }));
      setRendimientoPorJuego((prev) => ({ ...prev, [targetJuego]: rendimiento }));

      if (mostrarToast) {
        const fuenteTxt = fuente === 'supabase' ? 'Supabase' : 'JSON local';
        toast.success(`${cfg.nombre}: ${sorteos.length.toLocaleString('es-CO')} sorteos (${fuenteTxt})`);
      }
    } catch (error) {
      console.error(error);
      setHistorial([]);
      setResultado(null);
      toast.error(`Error cargando datos de ${cfg.nombre}`);
    } finally {
      setIsLoadingData(false);
    }
  }, [cargarTableroGeneral]);

  const ejecutarAnalisis = useCallback(() => {
    if (!historial.length) {
      toast.error('No hay historial para analizar');
      return;
    }

    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const jugadasBase = jugadasProgramadas[juego] ?? [];
        const res = analizarProbabilistico(historial, juego, jugadasBase.length === 6 ? jugadasBase : null);

        if (!jugadasBase.length) {
          const persistibles = convertirResultadoAJugadasPersistidas(res);
          setJugadasProgramadas((prev) => ({ ...prev, [juego]: persistibles }));
        }

        setResultado(res);
        toast.success(`Análisis completado con ${res.totalSorteos.toLocaleString('es-CO')} sorteos`);
      } catch (error) {
        console.error(error);
        toast.error('No se pudo completar el análisis');
      } finally {
        setIsAnalyzing(false);
      }
    }, 200);
  }, [historial, juego, jugadasProgramadas]);

  const actualizarSorteos = useCallback(async (): Promise<ResumenActualizacionApi> => {
    const response = await fetch('/api/actualizar-sorteos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const payload = (await response.json()) as Partial<ResumenActualizacionApi> & { error?: string };

    if (!response.ok || !payload.ok) {
      const mensaje = payload.error ?? payload.mensaje ?? 'No fue posible actualizar sorteos.';
      throw new Error(mensaje);
    }

    await cargarDatos(juego, false);
    return payload as ResumenActualizacionApi;
  }, [cargarDatos, juego]);

  const recargarDatos = useCallback(async () => {
    await cargarDatos(juego, false);
    toast.success('Datos recargados');
  }, [cargarDatos, juego]);

  const handleLimpiar = useCallback(() => {
    setResultado(null);
    toast.info('Resultados limpiados');
  }, []);

  const handleCambiarJuego = useCallback((nuevoJuego: TipoJuego) => {
    setJuego(nuevoJuego);
    setResultado(null);
  }, []);

  useEffect(() => {
    cargarDatos(juego, false);
  }, [juego, cargarDatos]);

  useEffect(() => {
    if (historial.length > 0 && !isLoadingData) {
      ejecutarAnalisis();
    }
  }, [historial, isLoadingData, ejecutarAnalisis]);

  const metadata = useMemo(() => {
    if (!historial.length) {
      return {
        total: 0,
        inicio: '',
        fin: '',
        ultimo: null as SorteoInput | null,
      };
    }

    return {
      total: historial.length,
      inicio: historial[0].date,
      fin: historial[historial.length - 1].date,
      ultimo: historial[historial.length - 1],
    };
  }, [historial]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <DatabaseZap className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight text-foreground">
              Loto <span className="text-primary">Analyzer</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => cargarDatos(juego)}
              disabled={isLoadingData}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors duration-150 disabled:opacity-50"
            >
              <RefreshCcw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              Recargar
            </button>

            <button
              onClick={handleLimpiar}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors duration-150"
            >
              <RotateCcw className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-6 sm:py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 p-4 rounded-xl bg-primary/5 border border-primary/10"
        >
          <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-foreground/80">
            Análisis estadístico sobre <strong>todo el histórico disponible</strong> de {config.nombre}. Las jugadas se
            mantienen fijas hasta el próximo sorteo y solo cambian cuando entran resultados nuevos.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-4"
          style={{ boxShadow: 'var(--shadow-sm)', background: 'hsl(var(--card))' }}
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Tipo de juego</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONFIG_JUEGO) as TipoJuego[]).map((key) => {
              const activo = juego === key;
              return (
                <button
                  key={key}
                  onClick={() => handleCambiarJuego(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activo
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {CONFIG_JUEGO[key].nombre}
                </button>
              );
            })}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <PanelDatos
              juegoActual={juego}
              nombreJuego={config.nombre}
              fuenteDatosActual={fuenteDatosActual}
              fuentesPorJuego={fuentesPorJuego}
              totalSorteos={metadata.total}
              fechaInicial={metadata.inicio}
              fechaFinal={metadata.fin}
              ultimoSorteo={metadata.ultimo}
              usaSuperbalota={config.usaSuperbalota}
              sbNombre={config.sbNombre}
              ultimosPorJuego={ultimosPorJuego}
              onActualizarSorteos={actualizarSorteos}
              onRecargarDatos={recargarDatos}
            />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center"
        >
          <button
            onClick={ejecutarAnalisis}
            disabled={isAnalyzing || isLoadingData || !historial.length}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-base hover:opacity-90 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: 'var(--shadow-md)' }}
            title="Las jugadas se mantienen fijas hasta el próximo sorteo"
          >
            {isAnalyzing ? (
              <>
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <DatabaseZap className="w-5 h-5" />
                Ver análisis del historial
              </>
            )}
          </button>
        </motion.div>

        <PanelResultados
          resultado={resultado}
          fechaObjetivo={fechaObjetivoPorJuego[juego] ?? ''}
          rendimiento={rendimientoPorJuego[juego] ?? []}
        />
      </main>

      <footer className="border-t border-border mt-12">
        <div className="max-w-[1200px] mx-auto px-4 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Loto Analyzer — Visualizador estadístico. No predice el futuro ni garantiza premios.
          </p>
        </div>
      </footer>
    </div>
  );
}
