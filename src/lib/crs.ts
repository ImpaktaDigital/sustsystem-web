import proj4 from 'proj4';
import type { LngLat } from './geodesy';
import { utmZoneFor } from './shared';

/**
 * Sistemas de coordenadas para exibição e entrada (US57). O armazenamento é sempre WGS 84 / EPSG:4326;
 * no Brasil, SIRGAS 2000 e WGS 84 coincidem na prática (diferença centimétrica).
 */
export type CrsKind = 'geo' | 'dms' | 'utm';

export interface Crs {
  kind: CrsKind;
  /** Zona UTM (17–25) e hemisfério, quando kind = 'utm'. */
  zone?: number;
  hemisphere?: 'N' | 'S';
}

export const UTM_ZONES = Array.from({ length: 9 }, (_, i) => 17 + i);

/** Código EPSG do SIRGAS 2000 / UTM (zonas brasileiras) ou do SIRGAS 2000 geográfico. */
export function epsgOf(crs: Crs) {
  if (crs.kind !== 'utm' || !crs.zone) return 4674;
  return crs.hemisphere === 'N' ? 31954 + crs.zone : 31960 + crs.zone;
}

export function crsLabel(crs: Crs) {
  if (crs.kind === 'utm') return `SIRGAS 2000 / UTM ${crs.zone}${crs.hemisphere} (EPSG:${epsgOf(crs)})`;
  return crs.kind === 'dms' ? 'SIRGAS 2000 geográficas — GMS (EPSG:4674)' : 'SIRGAS 2000 geográficas — graus decimais (EPSG:4674)';
}

/** Rótulos dos dois eixos na ordem em que são exibidos/digitados. */
export function axisLabels(crs: Crs): [string, string] {
  return crs.kind === 'utm' ? ['E (m)', 'N (m)'] : ['Latitude', 'Longitude'];
}

const utmDef = (zone: number, hemisphere: 'N' | 'S') =>
  `+proj=utm +zone=${zone}${hemisphere === 'S' ? ' +south' : ''} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;

export function toUtm([lng, lat]: LngLat, zone: number, hemisphere: 'N' | 'S'): [number, number] {
  return proj4('EPSG:4326', utmDef(zone, hemisphere), [lng, lat]) as [number, number];
}

export function fromUtm(e: number, n: number, zone: number, hemisphere: 'N' | 'S'): LngLat {
  return proj4(utmDef(zone, hemisphere), 'EPSG:4326', [e, n]) as LngLat;
}

/** Zona UTM sugerida para um ponto (a do centro da área ou do empreendimento). */
export function suggestedUtm(point: LngLat | null): Crs {
  if (!point) return { kind: 'utm', zone: 23, hemisphere: 'S' };
  const z = utmZoneFor(point[0], point[1]);
  return { kind: 'utm', zone: Math.min(25, Math.max(17, z.zone)), hemisphere: z.hemisphere };
}

const nf = (n: number, digits: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });

/** 22°54'20,16"S */
export function toDms(value: number, axis: 'lat' | 'lng') {
  const hemi = axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  let abs = Math.abs(value);
  let d = Math.floor(abs);
  abs = (abs - d) * 60;
  let m = Math.floor(abs);
  let s = Math.round((abs - m) * 60 * 1000) / 1000;
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}'${nf(s, 3).padStart(6, '0')}"${hemi}`;
}

/** Converte um vértice para os dois valores exibidos, na ordem de axisLabels. */
export function formatPair(point: LngLat, crs: Crs): [string, string] {
  if (crs.kind === 'utm') {
    const [e, n] = toUtm(point, crs.zone!, crs.hemisphere!);
    return [nf(e, 3), nf(n, 3)];
  }
  if (crs.kind === 'dms') return [toDms(point[1], 'lat'), toDms(point[0], 'lng')];
  return [nf(point[1], 8), nf(point[0], 8)];
}

/** Lê número aceitando vírgula decimal ("7465123,45") ou ponto. */
export function parseNumber(text: string) {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) {
    // "7.465.123,45" (pt-BR) ou "7,465,123.45" (en)
    return t.lastIndexOf(',') > t.lastIndexOf('.') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  }
  return Number(t.replace(',', '.'));
}

/** Lê "22°54'20,1\"S", "-22 54 20.1", "22.9056 S" ou número decimal. */
export function parseAngle(text: string): number {
  const t = text.trim().toUpperCase();
  if (!t) return NaN;
  const negative = /^-/.test(t) || /[SWO]$/.test(t);
  const parts = t.replace(/[NSEWLO]$/, '').replace(/^-/, '').split(/[°º'’"”\s]+/).filter(Boolean).map(parseNumber);
  if (!parts.length || parts.some((p) => Number.isNaN(p))) return NaN;
  const [d, m = 0, s = 0] = parts;
  const value = d + m / 60 + s / 3600;
  return negative ? -value : value;
}

/** Converte os dois valores digitados (na ordem de axisLabels) em [lng, lat]. Retorna null se inválido. */
export function parsePair(a: string, b: string, crs: Crs): LngLat | null {
  if (crs.kind === 'utm') {
    const e = parseNumber(a);
    const n = parseNumber(b);
    if (!Number.isFinite(e) || !Number.isFinite(n) || e < 100_000 || e > 900_000 || n < 0 || n > 10_000_000) return null;
    return fromUtm(e, n, crs.zone!, crs.hemisphere!);
  }
  const lat = crs.kind === 'dms' ? parseAngle(a) : parseNumber(a);
  const lng = crs.kind === 'dms' ? parseAngle(b) : parseNumber(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

/**
 * Lista de vértices colada (planilha, memorial, levantamento): uma linha por vértice, com 2 valores
 * (ou identificador + 2 valores) separados por tabulação, ponto e vírgula, espaços ou vírgula.
 */
export function parseCoordinateList(text: string, crs: Crs) {
  const points: LngLat[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    let cols = line.includes('\t') || line.includes(';') ? line.split(/[\t;]+/) : crs.kind === 'dms' ? line.split(/\s{2,}|,\s*(?=\d|-)/) : line.split(/\s+/);
    if (cols.length === 1 && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(line)) cols = line.split(',');
    cols = cols.map((c) => c.trim()).filter(Boolean);
    if (cols.length > 2) cols = cols.slice(-2); // descarta identificador do vértice (ex.: "P1", "V-01")
    const point = cols.length === 2 ? parsePair(cols[0], cols[1], crs) : null;
    if (point) points.push(point);
    else if (!/[a-z]{3,}/i.test(line) || index > 0) errors.push(index + 1); // ignora linha de cabeçalho
  });
  return { points, errors };
}
