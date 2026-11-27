import type { LngLat } from '../lib/geodesy';

/**
 * Geometria da folha e da escala da planta.
 * - Folhas ABNT série A, sempre em paisagem; margens da NBR 10068 (esquerda 25 mm; demais 10 mm em A0/A1 e 7 mm em A2–A4).
 * - O mapa é desenhado em Web Mercator (o mesmo do mapa de fundo) com a escala exata no centro da folha;
 *   na extensão de uma planta a variação de escala é desprezível.
 */
export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';
export const SHEET_SIZES: SheetSize[] = ['A4', 'A3', 'A2', 'A1', 'A0'];

/** Dimensões em mm (paisagem). */
export const SHEET_MM: Record<SheetSize, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};

/** Largura da coluna lateral (legenda, quadros, carimbo). */
export const SIDEBAR_MM: Record<SheetSize, number> = { A4: 82, A3: 105, A2: 135, A1: 170, A0: 185 };

export const STANDARD_SCALES = [200, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 50000, 100000, 250000];

export interface Frame {
  sheet: SheetSize;
  width: number;
  height: number;
  /** Área útil (dentro das margens). */
  inner: { x: number; y: number; w: number; h: number };
  /** Moldura do mapa. */
  map: { x: number; y: number; w: number; h: number };
  /** Coluna lateral. */
  side: { x: number; y: number; w: number; h: number };
}

export function frameOf(sheet: SheetSize): Frame {
  const [width, height] = SHEET_MM[sheet];
  const m = sheet === 'A0' || sheet === 'A1' ? 10 : 7;
  const inner = { x: 25, y: m, w: width - 25 - m, h: height - 2 * m };
  const sw = SIDEBAR_MM[sheet];
  return {
    sheet,
    width,
    height,
    inner,
    map: { x: inner.x, y: inner.y, w: inner.w - sw, h: inner.h },
    side: { x: inner.x + inner.w - sw, y: inner.y, w: sw, h: inner.h },
  };
}

// ───────────── Web Mercator em milímetros de papel ─────────────

const R = 6378137;
const lngX = (lng: number, ws: number) => ((180 + lng) / 360) * ws;
const latY = (lat: number, ws: number) => ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) * ws) / 360;

/** Projeção para a moldura do mapa: [lng, lat] → [x, y] em mm de papel (origem no canto superior esquerdo da folha). */
export function paperProjection(center: LngLat, scaleDenominator: number, map: Frame['map']) {
  // Tamanho do "mundo" em mm de papel para que a escala seja exata no centro
  const ws = (2 * Math.PI * R * Math.cos((center[1] * Math.PI) / 180) * 1000) / scaleDenominator;
  const cx = lngX(center[0], ws);
  const cy = latY(center[1], ws);
  const ox = map.x + map.w / 2;
  const oy = map.y + map.h / 2;
  const project = ([lng, lat]: LngLat): [number, number] => [lngX(lng, ws) - cx + ox, latY(lat, ws) - cy + oy];
  const unproject = ([x, y]: [number, number]): LngLat => {
    const wx = x - ox + cx;
    const wy = y - oy + cy;
    const lng = (wx / ws) * 360 - 180;
    const lat = (360 / Math.PI) * Math.atan(Math.exp(((180 - (wy * 360) / ws) * Math.PI) / 180)) - 90;
    return [lng, lat];
  };
  /** Zoom MapLibre (tiles de 512 px) para renderizar o fundo com `dpi` pontos por polegada. */
  const zoomForDpi = (dpi: number) => Math.log2((ws * dpi) / 25.4 / 512);
  return { project, unproject, zoomForDpi };
}

// ───────────── Escolha automática ─────────────

function extentMeters(points: LngLat[]) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }
  const lat = (s + n) / 2;
  return {
    center: [(w + e) / 2, (s + n) / 2] as LngLat,
    widthM: (e - w) * 111_320 * Math.cos((lat * Math.PI) / 180),
    heightM: (n - s) * 110_574,
  };
}

/** Menor escala padrão em que a extensão (com folga) cabe na moldura do mapa. */
export function fittingScale(sheet: SheetSize, widthM: number, heightM: number, padding = 1.15) {
  const { map } = frameOf(sheet);
  const needed = Math.max((widthM * padding * 1000) / map.w, (heightM * padding * 1000) / map.h);
  return STANDARD_SCALES.find((s) => s >= needed) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/**
 * Folha e escala automáticas conforme a dimensão do projeto:
 * - delimitação: a folha cresce com a maior dimensão da área (até 250 m → A4; 600 m → A3; 1,5 km → A2; 4 km → A1; acima → A0);
 * - localização: mostra o entorno (5× a extensão, no mínimo 2 km), em A4 ou A3.
 */
export function autoLayout(kind: 'LOCATION' | 'DELIMITATION', points: LngLat[]) {
  if (!points.length) return null;
  const ext = extentMeters(points);
  let { widthM, heightM } = ext;
  let sheet: SheetSize;
  if (kind === 'LOCATION') {
    widthM = Math.max(widthM * 5, 2000);
    heightM = Math.max(heightM * 5, 2000 * 0.66);
    sheet = Math.max(widthM, heightM) > 8000 ? 'A3' : 'A4';
  } else {
    const d = Math.max(widthM, heightM, 1);
    sheet = d <= 250 ? 'A4' : d <= 600 ? 'A3' : d <= 1500 ? 'A2' : d <= 4000 ? 'A1' : 'A0';
  }
  return { sheet, scaleDenominator: fittingScale(sheet, widthM, heightM), center: ext.center, widthM, heightM };
}

/** "Bom" intervalo (1, 2, 2,5 ou 5 × 10ⁿ) próximo do valor. */
export function niceInterval(value: number) {
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const f = value / base;
  return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * base;
}
