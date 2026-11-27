/**
 * Utilidades geográficas compartilhadas.
 *
 * Armazenamento: WGS 84 (EPSG:4326), padrão de GPS e GeoJSON.
 * Apresentação técnica (plantas): SIRGAS 2000 / UTM, zona calculada pela localização.
 * Para o Brasil, SIRGAS 2000 e WGS 84 coincidem na prática (diferença centimétrica).
 */

export const STORAGE_SRID = 4326;
export const SIRGAS2000_GEOGRAPHIC_SRID = 4674;

export interface UtmZone {
  zone: number;
  hemisphere: 'N' | 'S';
  /** EPSG SIRGAS 2000 / UTM (31971–31985 cobrem as zonas 17–25 usadas no Brasil). */
  epsg: number;
  label: string;
}

export function utmZoneFor(longitude: number, latitude: number): UtmZone {
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new RangeError('Coordenadas fora do intervalo válido');
  }
  const zone = Math.min(60, Math.floor((longitude + 180) / 6) + 1);
  const hemisphere = latitude < 0 ? 'S' : 'N';
  // SIRGAS 2000 / UTM: zonas 17N–22N → 31971–31976 ; zonas 17S–25S → 31977–31985
  let epsg: number;
  if (hemisphere === 'S' && zone >= 17 && zone <= 25) epsg = 31960 + zone;
  else if (hemisphere === 'N' && zone >= 17 && zone <= 22) epsg = 31954 + zone;
  else epsg = hemisphere === 'S' ? 32700 + zone : 32600 + zone; // WGS 84 / UTM fora do Brasil
  return { zone, hemisphere, epsg, label: `SIRGAS 2000 / UTM zone ${zone}${hemisphere}` };
}

export function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
