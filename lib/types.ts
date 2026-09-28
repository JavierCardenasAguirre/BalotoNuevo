export type TipoJuego = 'miloto' | 'baloto' | 'powerball';

export interface SorteoJSON {
  date: string;
  regulares: number[];
  sb?: number;
}

export interface SorteoInput {
  date: string;
  regulares: number[];
  superbalota?: number;
}

export interface JuegoConfig {
  nombre: string;
  maxRegular: number;
  usaSuperbalota: boolean;
  sbMax: number;
  sbNombre: string;
}

export interface NumeroMetrica {
  numero: number;
  frecuencia: number;
  porcentajeSorteos: number;
  sorteosDesdeUltimaAparicion: number;
  ultimaFecha: string | null;
  puntaje: number;
}

export interface RangoMetrica {
  etiqueta: string;
  desde: number;
  hasta: number;
  apariciones: number;
  porcentaje: number;
}

export interface ParidadMetrica {
  etiqueta: string;
  sorteos: number;
  porcentaje: number;
}

export interface CoocurrenciaMetrica {
  numeros: [number, number];
  frecuencia: number;
}

export interface JugadaRecomendada {
  id: number;
  regulares: number[];
  superbalota?: number;
  puntaje: number;
  indiceImpopularidad: number;
  riesgoPopularidad: number;
  razones: string[];
}

export interface ChiCuadradoMetrica {
  valor: number;
  gradosLibertad: number;
  esperadoPorNumero: number;
  razonChiGl: number;
  interpretacion: string;
}

export interface EstadisticasSuma {
  promedio: number;
  minimo: number;
  maximo: number;
  p10: number;
  p90: number;
}

export interface ProbabilidadPremio {
  categoria: string;
  aciertos: string;
  probabilidad: number;
  texto: string;
}

export interface JugadaPersistida {
  nums: number[];
  sb: number | null;
}

export interface AciertoJugada {
  hits: number;
  sb_ok: boolean;
}

export interface RendimientoRealItem {
  juego: TipoJuego;
  para_fecha: string;
  generado_en?: string;
  jugadas: JugadaPersistida[];
  aciertos: AciertoJugada[] | null;
  total_aciertos: number | null;
}

export interface ResultadoAnalisis {
  juego: TipoJuego;
  nombreJuego: string;
  totalSorteos: number;
  fechaInicial: string;
  fechaFinal: string;
  ultimoSorteo: SorteoInput;
  usaSuperbalota: boolean;
  sbNombre: string;
  totalCombinaciones: number;
  probabilidadTexto: string;
  notaHonestidad: string;
  semillaDeterministica: string;
  poolDisjunto: number[];
  coberturaDisjunta: number;
  numerosCalientes: NumeroMetrica[];
  numerosFrios: NumeroMetrica[];
  rachasAusencia: NumeroMetrica[];
  superbalotasCalientes: NumeroMetrica[];
  superbalotasFrias: NumeroMetrica[];
  distribucionRangos: RangoMetrica[];
  distribucionParidad: ParidadMetrica[];
  estadisticasSuma: EstadisticasSuma;
  coocurrenciasTop: CoocurrenciaMetrica[];
  chiCuadrado: ChiCuadradoMetrica;
  recomendaciones: JugadaRecomendada[];
  tablaProbabilidades: ProbabilidadPremio[];
}
