import { Geodesic } from 'geographiclib-geodesic';

/**
 * Medidas geodésicas no elipsoide WGS 84 (GeographicLib) — o mesmo cálculo do PostGIS (geography) usado pela API,
 * então os valores exibidos durante a edição coincidem com os gravados.
 */
export type LngLat = [number, number];

const geod = Geodesic.WGS84;

/** Área (m²) e perímetro (m) de um anel aberto (sem repetir o primeiro vértice). */
export function polygonMetrics(ring: LngLat[]) {
  if (ring.length < 3) return { areaM2: 0, perimeterM: lineLength(ring) };
  const poly = geod.Polygon(false);
  ring.forEach(([lng, lat]) => poly.AddPoint(lat, lng));
  const r = poly.Compute(false, true);
  return { areaM2: Math.abs(r.area ?? 0), perimeterM: r.perimeter };
}

/** Comprimento geodésico (m) de uma linha. */
export function lineLength(points: LngLat[]) {
  if (points.length < 2) return 0;
  const line = geod.Polygon(true);
  points.forEach(([lng, lat]) => line.AddPoint(lat, lng));
  return line.Compute(false, true).perimeter;
}

/** Distância (m) e azimute (graus, 0–360) entre dois pontos. */
export function segment(a: LngLat, b: LngLat) {
  const r = geod.Inverse(a[1], a[0], b[1], b[0]);
  return { distanceM: r.s12 ?? 0, azimuth: (((r.azi1 ?? 0) % 360) + 360) % 360 };
}

const nf = (n: number, digits: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatM2 = (m2: number) => `${nf(m2, 2)} m²`;
export const formatHa = (m2: number) => `${nf(m2 / 10_000, 4)} ha`;
export const formatMeters = (m: number) => (m >= 1000 ? `${nf(m / 1000, 3)} km` : `${nf(m, 2)} m`);

/** Ponto central (média simples dos vértices) — suficiente para escolher a zona UTM. */
export function centroid(points: LngLat[]): LngLat | null {
  if (!points.length) return null;
  const [lng, lat] = points.reduce(([x, y], [a, b]) => [x + a, y + b], [0, 0]);
  return [lng / points.length, lat / points.length];
}
