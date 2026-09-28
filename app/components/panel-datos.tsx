'use client'

import { useMemo, useState } from 'react'
import { Database, CalendarDays, History, RefreshCcw, PlusCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { SorteoInput, TipoJuego } from '@/lib/analisis-probabilistico'
import { CONFIG_JUEGO } from '@/lib/analisis-probabilistico'
import { upsertSorteoManual } from '@/lib/supabase'

type FuenteDatos = 'supabase' | 'local';

type ResumenActualizacionApi = {
  ok: boolean;
  mensaje: string;
  agregados: Record<TipoJuego, number>;
  totales: Record<TipoJuego, number>;
};

interface PanelDatosProps {
  juegoActual: TipoJuego;
  nombreJuego: string;
  fuenteDatosActual: FuenteDatos;
  fuentesPorJuego: Record<TipoJuego, FuenteDatos>;
  totalSorteos: number;
  fechaInicial: string;
  fechaFinal: string;
  ultimoSorteo: SorteoInput | null;
  usaSuperbalota: boolean;
  sbNombre: string;
  ultimosPorJuego: Record<TipoJuego, SorteoInput[]>;
  onActualizarSorteos: () => Promise<ResumenActualizacionApi>;
  onRecargarDatos: () => Promise<void>;
}

const JUEGOS: TipoJuego[] = ['baloto', 'miloto', 'powerball'];

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatearFecha(fecha: string): string {
  if (!fecha) return 'N/D';
  const d = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function nombreJuegoUI(juego: TipoJuego): string {
  return CONFIG_JUEGO[juego].nombre;
}

export default function PanelDatos({
  juegoActual,
  nombreJuego,
  fuenteDatosActual,
  fuentesPorJuego,
  totalSorteos,
  fechaInicial,
  fechaFinal,
  ultimoSorteo,
  usaSuperbalota,
  sbNombre,
  ultimosPorJuego,
  onActualizarSorteos,
  onRecargarDatos,
}: PanelDatosProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manual, setManual] = useState({
    juego: juegoActual,
    fecha: '',
    n1: '',
    n2: '',
    n3: '',
    n4: '',
    n5: '',
    sb: '',
  });

  const fuenteTexto = fuenteDatosActual === 'supabase' ? 'Supabase' : 'JSON local';

  const ultimosResumen = useMemo(() => {
    const out: Record<TipoJuego, SorteoInput | null> = {
      baloto: null,
      miloto: null,
      powerball: null,
    };

    for (const juego of JUEGOS) {
      out[juego] = ultimosPorJuego[juego]?.[0] ?? null;
    }

    return out;
  }, [ultimosPorJuego]);

  const handleActualizar = async () => {
    setIsUpdating(true);
    try {
      const res = await onActualizarSorteos();
      toast.success(
        `Actualización completada. Nuevos: Baloto ${res.agregados.baloto}, MiLoto ${res.agregados.miloto}, Powerball ${res.agregados.powerball}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar sorteos');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleManualChange = (field: keyof typeof manual, value: string) => {
    setManual((prev) => ({ ...prev, [field]: value }));
  };

  const registrarManual = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const cfg = CONFIG_JUEGO[manual.juego];
    const numeros = [manual.n1, manual.n2, manual.n3, manual.n4, manual.n5].map((v) => Number(v));

    if (!manual.fecha) {
      toast.error('Debes ingresar una fecha válida.');
      return;
    }

    if (numeros.some((n) => !Number.isInteger(n))) {
      toast.error('Los 5 números deben ser enteros.');
      return;
    }

    if (numeros.some((n) => n < 1 || n > cfg.maxRegular)) {
      toast.error(`Los números de ${cfg.nombre} deben estar entre 1 y ${cfg.maxRegular}.`);
      return;
    }

    if (new Set(numeros).size !== 5) {
      toast.error('Los 5 números no pueden repetirse.');
      return;
    }

    let sb: number | null = null;
    if (cfg.usaSuperbalota) {
      const sbValue = Number(manual.sb);
      if (!Number.isInteger(sbValue) || sbValue < 1 || sbValue > cfg.sbMax) {
        toast.error(`La ${cfg.sbNombre} debe estar entre 1 y ${cfg.sbMax}.`);
        return;
      }
      sb = sbValue;
    }

    setIsSavingManual(true);
    try {
      await upsertSorteoManual({
        juego: manual.juego,
        fecha: manual.fecha,
        numeros,
        sb,
      });

      toast.success(`Sorteo de ${cfg.nombre} registrado/actualizado correctamente.`);
      await onRecargarDatos();

      setManual((prev) => ({
        ...prev,
        fecha: '',
        n1: '',
        n2: '',
        n3: '',
        n4: '',
        n5: '',
        sb: '',
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el sorteo');
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div className="rounded-xl p-5 sm:p-6" style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold tracking-tight text-card-foreground">Datos históricos cargados</h2>
            <p className="text-xs text-muted-foreground">
              Fuente actual ({nombreJuego}): <strong>{fuenteTexto}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={handleActualizar}
          disabled={isUpdating}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCcw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
          Actualizar sorteos
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg p-3 bg-muted/50">
          <p className="text-xs text-muted-foreground">Total sorteos ({nombreJuego})</p>
          <p className="text-xl font-mono font-bold text-primary">{totalSorteos.toLocaleString('es-CO')}</p>
        </div>
        <div className="rounded-lg p-3 bg-muted/50">
          <p className="text-xs text-muted-foreground">Desde</p>
          <p className="text-sm font-semibold text-foreground">{formatearFecha(fechaInicial)}</p>
        </div>
        <div className="rounded-lg p-3 bg-muted/50">
          <p className="text-xs text-muted-foreground">Hasta</p>
          <p className="text-sm font-semibold text-foreground">{formatearFecha(fechaFinal)}</p>
        </div>
        <div className="rounded-lg p-3 bg-muted/50">
          <p className="text-xs text-muted-foreground">Último ({nombreJuego})</p>
          <p className="text-sm font-semibold text-foreground">{ultimoSorteo ? formatearFecha(ultimoSorteo.date) : 'N/D'}</p>
        </div>
      </div>

      {ultimoSorteo && (
        <div className="rounded-lg p-3 mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-1.5 mb-1 text-amber-700 dark:text-amber-300 text-xs font-semibold">
            <CalendarDays className="w-3.5 h-3.5" /> Último sorteo de {nombreJuego} ({formatearFecha(ultimoSorteo.date)})
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ultimoSorteo.regulares.map((n, idx) => (
              <span key={idx} className="w-9 h-9 rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold inline-flex items-center justify-center">
                {pad2(n)}
              </span>
            ))}
            {usaSuperbalota && (
              <>
                <div className="w-px h-6 bg-amber-300 mx-1" />
                <span className="w-9 h-9 rounded-full bg-red-500 text-white text-xs font-mono font-bold inline-flex items-center justify-center" title={sbNombre}>
                  {pad2(ultimoSorteo.superbalota ?? 0)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
          <History className="w-3.5 h-3.5" /> Últimos sorteos visibles por juego
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {JUEGOS.map((juego) => {
            const cfg = CONFIG_JUEGO[juego];
            const sorteos = ultimosPorJuego[juego] ?? [];
            const fuente = fuentesPorJuego[juego] === 'supabase' ? 'Supabase' : 'Local';

            return (
              <div key={juego} className="rounded-lg border border-border p-3 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">{cfg.nombre}</p>
                  <span className="text-[11px] text-muted-foreground">{fuente}</span>
                </div>

                <p className="text-[11px] text-muted-foreground mb-2">
                  Último: {ultimosResumen[juego] ? formatearFecha(ultimosResumen[juego]?.date ?? '') : 'N/D'}
                </p>

                <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                  {sorteos.map((s, idx) => (
                    <motion.div
                      key={`${juego}-${s.date}-${idx}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs p-2 rounded-md bg-background border border-border"
                    >
                      <p className="font-mono text-muted-foreground mb-1">{formatearFecha(s.date)}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {s.regulares.map((n, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{pad2(n)}</span>
                        ))}
                        {cfg.usaSuperbalota && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 font-mono">
                            {cfg.sbNombre}: {pad2(s.superbalota ?? 0)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 bg-muted/20">
        <div className="flex items-center gap-1.5 mb-3">
          <PlusCircle className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Registrar sorteo manual</h3>
        </div>

        <form onSubmit={registrarManual} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="text-xs">
              <span className="block mb-1 text-muted-foreground">Juego</span>
              <select
                value={manual.juego}
                onChange={(e) => handleManualChange('juego', e.target.value as TipoJuego)}
                className="w-full h-9 rounded-md border border-border bg-background px-2"
              >
                <option value="baloto">Baloto</option>
                <option value="miloto">MiLoto</option>
                <option value="powerball">Powerball</option>
              </select>
            </label>

            <label className="text-xs">
              <span className="block mb-1 text-muted-foreground">Fecha</span>
              <input
                type="date"
                value={manual.fecha}
                onChange={(e) => handleManualChange('fecha', e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2"
                required
              />
            </label>

            {[1, 2, 3, 4, 5].map((idx) => (
              <label className="text-xs" key={idx}>
                <span className="block mb-1 text-muted-foreground">N{idx}</span>
                <input
                  type="number"
                  value={manual[`n${idx}` as 'n1' | 'n2' | 'n3' | 'n4' | 'n5']}
                  onChange={(e) => handleManualChange(`n${idx}` as 'n1' | 'n2' | 'n3' | 'n4' | 'n5', e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2"
                  required
                />
              </label>
            ))}

            {CONFIG_JUEGO[manual.juego].usaSuperbalota && (
              <label className="text-xs">
                <span className="block mb-1 text-muted-foreground">{CONFIG_JUEGO[manual.juego].sbNombre}</span>
                <input
                  type="number"
                  value={manual.sb}
                  onChange={(e) => handleManualChange('sb', e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2"
                  required
                />
              </label>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Validación automática por juego: Baloto 1-43 + Superbalota 1-16, MiLoto 1-39, Powerball 1-69 + Powerball 1-26.
          </p>

          <button
            type="submit"
            disabled={isSavingManual}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {isSavingManual ? (
              <>
                <RefreshCcw className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar sorteo manual'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
