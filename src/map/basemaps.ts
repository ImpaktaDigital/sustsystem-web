/**
 * Mapas base — provedor abstraído (seção 10.3 do documento de requisitos).
 * Para trocar de fornecedor (MapTiler, Mapbox, imagens próprias), basta alterar esta configuração.
 *
 * MVP: OpenStreetMap (ruas) + Esri World Imagery (satélite), sem chave de API.
 * ATENÇÃO: antes de produção comercial, revisar os termos de uso:
 *  - tile.openstreetmap.org não é destinado a uso intensivo (https://operations.osmfoundation.org/policies/tiles/)
 *  - Esri World Imagery exige atribuição e tem limites/licenciamento para uso comercial.
 */
import type { StyleSpecification } from 'maplibre-gl';

export interface Basemap {
  id: string;
  label: string;
  tiles: string[];
  attribution: string;
  maxzoom: number;
}

export const BASEMAPS: Basemap[] = [
  {
    id: 'streets',
    label: 'Mapa',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxzoom: 19,
  },
  {
    id: 'satellite',
    label: 'Satélite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
  },
];

/** Estilo MapLibre com todos os mapas base como camadas; só um fica visível por vez. */
export function buildStyle(initial = 'streets'): StyleSpecification {
  return {
    version: 8,
    sources: Object.fromEntries(
      BASEMAPS.map((b) => [b.id, { type: 'raster', tiles: b.tiles, tileSize: 256, attribution: b.attribution, maxzoom: b.maxzoom }]),
    ),
    layers: BASEMAPS.map((b) => ({
      id: `basemap-${b.id}`,
      type: 'raster',
      source: b.id,
      layout: { visibility: b.id === initial ? 'visible' : 'none' },
    })),
  } as StyleSpecification;
}

/** Centro geográfico aproximado do Brasil, para mapas sem dados. */
export const BRAZIL_CENTER: [number, number] = [-51.9, -14.2];
