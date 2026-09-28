'use client'

import { Sparkles, TrendingUp, Hash, AlertTriangle, Scale, Shuffle, Flame, Snowflake, Target } from 'lucide-react'
import { motion } from 'framer-motion'
import type { RendimientoRealItem } from '@/lib/types'
import type { ResultadoAnalisis } from '@/lib/analisis-probabilistico'

interface PanelResultadosProps {
  resultado: ResultadoAnalisis | null;
  fechaObjetivo: string;
  rendimiento: RendimientoRealItem[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function BadgeNumero({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`w-9 h-9 rounded-full inline-flex items-center justify-center text-xs font-mono font-bold ${className}`}>
      {pad2(n)}
    </span>
  );
}

function esperadoAciertosPorJuego(juego: ResultadoAnalisis['juego']): number {
  if (juego === 'baloto') return Number((6 * 5 * 5 / 43).toFixed(2));
  if (juego === 'miloto') return Number((6 * 5 * 5 / 39).toFixed(2));
  return Number((6 * 5 * 5 / 69).toFixed(2));
}

export default function PanelResultados({ resultado, fechaObjetivo, rendimiento }: PanelResultadosProps) {
  if (!resultado) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}>
        <div className="p-3 rounded-full bg-muted inline-flex mb-3">
          <Sparkles className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">
          Carga los datos históricos y presiona <strong>"Ver análisis del historial"</strong> para ver métricas y jugadas sugeridas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-5 sm:p-6"
        style={{ boxShadow: 'var(--shadow-lg)', background: 'hsl(var(--card))' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-display font-bold tracking-tight text-card-foreground">Jugadas fijas hasta el próximo sorteo</h2>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Fecha objetivo: <strong>{fechaObjetivo || 'N/D'}</strong> · Semilla determinística: <span className="font-mono">{resultado.semillaDeterministica}</span>
        </p>

        <div className="space-y-3">
          {resultado.recomendaciones.map((jugada, idx) => (
            <div key={idx} className={`p-3 rounded-lg border ${idx === 0 ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-muted/40 border-border'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-foreground">{`Jugada ${idx + 1}`}</p>
                <div className="text-[11px] text-muted-foreground">
                  Impopularidad: <strong>{jugada.indiceImpopularidad.toFixed(1)}%</strong>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {jugada.regulares.map((n, i) => (
                  <BadgeNumero key={i} n={n} className="bg-primary text-primary-foreground" />
                ))}
                {resultado.usaSuperbalota && (
                  <>
                    <div className="w-px h-7 bg-border mx-1" />
                    <BadgeNumero n={jugada.superbalota ?? 0} className="bg-red-500 text-white" />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Cobertura disjunta: <strong>{resultado.poolDisjunto.length} números distintos</strong> ({resultado.coberturaDisjunta.toFixed(2)}% del tablero).
          </p>
          <p className="text-xs text-blue-700/90 dark:text-blue-300/90 mt-1">
            Estas jugadas son fijas hasta que llegue un resultado nuevo. Ninguna estrategia cambia la probabilidad de acertar.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl p-5 sm:p-6"
        style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-muted">
            <Target className="w-5 h-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-display font-bold tracking-tight text-card-foreground">Rendimiento real</h2>
        </div>

        {rendimiento.length === 0 || !rendimiento.some((r) => r.aciertos && r.total_aciertos !== null) ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay sorteos comparados — las jugadas se evaluarán automáticamente cuando se actualicen los resultados.
          </p>
        ) : (
          <div className="space-y-3">
            {rendimiento
              .filter((r) => r.aciertos && r.total_aciertos !== null)
              .slice(0, 8)
              .map((row) => (
                <div key={`${row.juego}-${row.para_fecha}`} className="rounded-lg border border-border p-3 bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold">Sorteo objetivo: {row.para_fecha}</p>
                    <p className="text-xs text-muted-foreground">Total aciertos: <strong>{row.total_aciertos}</strong></p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {row.jugadas.map((j, idx) => (
                      <div key={idx} className="rounded-md p-2 bg-background border border-border text-xs">
                        <p className="font-semibold mb-1">Jugada {idx + 1}</p>
                        <p className="font-mono mb-1">{j.nums.map(pad2).join(' - ')}{j.sb !== null ? ` | SB ${pad2(j.sb)}` : ''}</p>
                        <p className="text-muted-foreground">
                          Aciertos: <strong>{row.aciertos?.[idx]?.hits ?? 0}</strong>
                          {resultado.usaSuperbalota ? ` · SB: ${(row.aciertos?.[idx]?.sb_ok ?? false) ? 'Sí' : 'No'}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          Esperado por azar para {resultado.nombreJuego}: <strong>~{esperadoAciertosPorJuego(resultado.juego)} aciertos</strong> por bloque de 6 jugadas.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl p-5 sm:p-6"
        style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-muted">
            <Hash className="w-5 h-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-display font-bold tracking-tight text-card-foreground">Tabla de probabilidades reales</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-2">Categoría</th>
                <th className="py-2 pr-2">Aciertos</th>
                <th className="py-2 pr-2">Probabilidad</th>
              </tr>
            </thead>
            <tbody>
              {resultado.tablaProbabilidades.map((row, idx) => (
                <tr key={idx} className="border-b border-border/40">
                  <td className="py-2 pr-2">{row.categoria}</td>
                  <td className="py-2 pr-2 font-mono">{row.aciertos}</td>
                  <td className="py-2 pr-2">{row.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Toda combinación tiene la misma probabilidad. Estas tablas no cambian por usar estadísticas.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl p-5 sm:p-6"
        style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-lg p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">Sorteos analizados</p>
            <p className="text-xl font-mono font-bold text-primary">{resultado.totalSorteos.toLocaleString('es-CO')}</p>
          </div>
          <div className="rounded-lg p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">Probabilidad exacta</p>
            <p className="text-sm font-semibold text-foreground">{resultado.probabilidadTexto}</p>
          </div>
          <div className="rounded-lg p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">Chi-cuadrado</p>
            <p className="text-sm font-semibold text-foreground">{resultado.chiCuadrado.valor} (χ²/gl: {resultado.chiCuadrado.razonChiGl})</p>
          </div>
          <div className="rounded-lg p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">Suma típica (P10-P90)</p>
            <p className="text-sm font-semibold text-foreground">{resultado.estadisticasSuma.p10} - {resultado.estadisticasSuma.p90}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl p-5"
          style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-sm">Números más frecuentes ("calientes")</h3>
          </div>
          <div className="space-y-2">
            {resultado.numerosCalientes.slice(0, 8).map((m) => (
              <div key={m.numero} className="flex items-center justify-between text-xs bg-muted/40 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <BadgeNumero n={m.numero} className="bg-primary/10 text-primary" />
                  <span>{m.frecuencia} apariciones</span>
                </div>
                <span className="text-muted-foreground">{m.sorteosDesdeUltimaAparicion} sorteos sin salir</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl p-5"
          style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Snowflake className="w-4 h-4 text-sky-500" />
            <h3 className="font-semibold text-sm">Números de menor frecuencia ("fríos")</h3>
          </div>
          <div className="space-y-2">
            {resultado.numerosFrios.slice(0, 8).map((m) => (
              <div key={m.numero} className="flex items-center justify-between text-xs bg-muted/40 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <BadgeNumero n={m.numero} className="bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300" />
                  <span>{m.frecuencia} apariciones</span>
                </div>
                <span className="text-muted-foreground">{m.sorteosDesdeUltimaAparicion} sorteos sin salir</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl p-5"
          style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
        >
          <h3 className="font-semibold text-sm mb-3">Rachas de ausencia</h3>
          <div className="space-y-1.5">
            {resultado.rachasAusencia.slice(0, 8).map((m) => (
              <div key={m.numero} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40">
                <span className="font-mono">{pad2(m.numero)}</span>
                <span>{m.sorteosDesdeUltimaAparicion} sorteos</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-xl p-5"
          style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
        >
          <h3 className="font-semibold text-sm mb-3">Distribución por rangos</h3>
          <div className="space-y-1.5">
            {resultado.distribucionRangos.map((r) => (
              <div key={r.etiqueta} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40">
                <span>{r.etiqueta}</span>
                <span>{r.porcentaje.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl p-5"
          style={{ boxShadow: 'var(--shadow-md)', background: 'hsl(var(--card))' }}
        >
          <div className="flex items-center gap-1.5 mb-3">
            <Scale className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Pares / impares</h3>
          </div>
          <div className="space-y-1.5 mb-3">
            {resultado.distribucionParidad.slice(0, 5).map((p) => (
              <div key={p.etiqueta} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40">
                <span>{p.etiqueta}</span>
                <span>{p.porcentaje.toFixed(1)}%</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
            <Shuffle className="w-3.5 h-3.5" /> Co-ocurrencias top
          </div>
          <div className="space-y-1.5">
            {resultado.coocurrenciasTop.slice(0, 5).map((c, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40">
                <span className="font-mono">{pad2(c.numeros[0])}-{pad2(c.numeros[1])}</span>
                <span>{c.frecuencia}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="rounded-xl p-4 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/15">
        <p className="text-xs text-orange-700 dark:text-orange-300 flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Este panel no ofrece “números infalibles”. Las jugadas fijas priorizan cobertura y menor popularidad,
            pero la probabilidad de acertar se mantiene igual para cualquier combinación.
          </span>
        </p>
      </div>
    </div>
  );
}
