import { fromUtm } from './crs';

/**
 * Importação de arquivos geográficos (RF31 / US54): GeoJSON, KML, KMZ e Shapefile (.zip com .shp/.dbf/.prj).
 * As bibliotecas de leitura são carregadas sob demanda para não pesar no carregamento do sistema.
 * Polígonos e multipolígonos viram áreas (cada parte de um multipolígono vira uma área); linhas fechadas também.
 */
export interface ImportedPolygon {
  name: string;
  /** Anéis no sistema do arquivo: [x, y] (graus, ou metros quando `projected`). */
  rings: number[][][];
  properties: Record<string, unknown>;
}

export interface ImportResult {
  polygons: ImportedPolygon[];
  ignored: { points: number; lines: number };
  /** Coordenadas em metros (ex.: UTM) sem definição de projeção: é preciso informar a zona. */
  projected: boolean;
  /** Zona UTM SIRGAS 2000 lida do próprio arquivo (GeoJSON com "crs"), quando houver. */
  detectedUtm?: { zone: number; hemisphere: 'N' | 'S' };
  format: string;
}

type Geometry = { type: string; coordinates?: unknown; geometries?: Geometry[] };
type Feature = { type: 'Feature'; geometry: Geometry | null; properties?: Record<string, unknown> | null };

export const ACCEPTED_EXTENSIONS = '.geojson,.json,.kml,.kmz,.zip';

const NAME_KEYS = ['name', 'Name', 'NAME', 'nome', 'Nome', 'NOME', 'descricao', 'DESCRICAO', 'id', 'ID'];

function featureName(props: Record<string, unknown>, fallback: string) {
  for (const key of NAME_KEYS) {
    const v = props[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 150);
    if (typeof v === 'number') return String(v);
  }
  return fallback;
}

const strip = (ring: unknown) => (ring as number[][]).map((p) => [Number(p[0]), Number(p[1])]);

function collect(features: Feature[], result: ImportResult) {
  let counter = 0;
  const push = (rings: number[][][], props: Record<string, unknown>, suffix = '') => {
    counter += 1;
    result.polygons.push({ name: featureName(props, `Área importada ${counter}`) + suffix, rings, properties: props });
  };
  const visit = (g: Geometry | null, props: Record<string, unknown>) => {
    if (!g) return;
    switch (g.type) {
      case 'Polygon':
        push((g.coordinates as unknown[]).map(strip), props);
        break;
      case 'MultiPolygon': {
        const parts = g.coordinates as unknown[][];
        parts.forEach((poly, i) => push(poly.map(strip), props, parts.length > 1 ? ` (parte ${i + 1})` : ''));
        break;
      }
      case 'LineString': {
        const line = strip(g.coordinates);
        const [f, l] = [line[0], line[line.length - 1]];
        if (line.length >= 4 && f[0] === l[0] && f[1] === l[1]) push([line], props);
        else result.ignored.lines += 1;
        break;
      }
      case 'MultiLineString':
        (g.coordinates as unknown[]).forEach((c) => visit({ type: 'LineString', coordinates: c }, props));
        break;
      case 'Point':
      case 'MultiPoint':
        result.ignored.points += 1;
        break;
      case 'GeometryCollection':
        g.geometries?.forEach((child) => visit(child, props));
        break;
    }
  };
  features.forEach((f) => visit(f.geometry, f.properties ?? {}));
}

function toFeatures(data: unknown): Feature[] {
  const d = data as { type?: string; features?: Feature[]; geometry?: Geometry };
  if (Array.isArray(data)) return data.flatMap(toFeatures);
  if (d?.type === 'FeatureCollection') return d.features ?? [];
  if (d?.type === 'Feature') return [d as Feature];
  if (d?.type) return [{ type: 'Feature', geometry: d as Geometry, properties: {} }];
  return [];
}

/** "EPSG:31983" / "urn:ogc:def:crs:EPSG::31983" → zona SIRGAS 2000 / UTM. */
function utmFromCrsName(name?: string) {
  const code = Number(name?.match(/EPSG:{1,2}(\d+)/i)?.[1]);
  if (code >= 31977 && code <= 31985) return { zone: code - 31960, hemisphere: 'S' as const };
  if (code >= 31971 && code <= 31976) return { zone: code - 31954, hemisphere: 'N' as const };
  if (code >= 32717 && code <= 32725) return { zone: code - 32700, hemisphere: 'S' as const }; // WGS 84 / UTM S
  return undefined;
}

async function parseKml(text: string) {
  const { kml } = await import('@tmcw/togeojson');
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo KML inválido');
  return kml(doc);
}

export async function readGeoFile(file: File): Promise<ImportResult> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const result: ImportResult = { polygons: [], ignored: { points: 0, lines: 0 }, projected: false, format: ext.toUpperCase() };
  let data: unknown;

  if (ext === 'geojson' || ext === 'json') {
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('O arquivo não é um GeoJSON válido');
    }
    result.detectedUtm = utmFromCrsName((data as { crs?: { properties?: { name?: string } } }).crs?.properties?.name);
    result.format = 'GeoJSON';
  } else if (ext === 'kml') {
    data = await parseKml(await file.text());
    result.format = 'KML';
  } else if (ext === 'kmz') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.kml'));
    if (!entry) throw new Error('O KMZ não contém um arquivo .kml');
    data = await parseKml(await entry.async('text'));
    result.format = 'KMZ';
  } else if (ext === 'zip') {
    const { parseZip } = await import('shpjs');
    try {
      data = await parseZip(await file.arrayBuffer());
    } catch {
      throw new Error('Não foi possível ler o Shapefile. O .zip deve conter os arquivos .shp, .dbf e, de preferência, .prj');
    }
    result.format = 'Shapefile';
  } else {
    throw new Error('Formato não suportado. Use GeoJSON, KML, KMZ ou Shapefile (.zip)');
  }

  collect(toFeatures(data), result);
  result.projected = result.polygons.some((p) => p.rings.some((r) => r.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90)));
  return result;
}

/** Converte os anéis para [lng, lat] (reprojetando de UTM quando necessário) e fecha/limpa os anéis. */
export function toLngLatRings(polygon: ImportedPolygon, utm?: { zone: number; hemisphere: 'N' | 'S' }) {
  return polygon.rings.map((ring) => {
    const points = ring.map(([x, y]) => (utm ? fromUtm(x, y, utm.zone, utm.hemisphere) : [x, y]) as [number, number]);
    const first = points[0];
    const last = points[points.length - 1];
    if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) points.pop();
    return points;
  });
}
