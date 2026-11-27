import { SegmentedControl } from '@mantine/core';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { BASEMAPS, BRAZIL_CENTER, buildStyle } from './basemaps';

export interface MapPoint {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
  subtitle?: string;
  href?: string;
}

interface Props {
  height?: number | string;
  points?: MapPoint[];
  /** Ponto editável (ex.: localização do empreendimento). */
  selected?: { longitude: number; latitude: number } | null;
  onPick?: (lngLat: { longitude: number; latitude: number }) => void;
  initialBasemap?: string;
  onPointClick?: (point: MapPoint) => void;
  /** Centraliza o mapa num ponto/zoom sempre que `key` mudar (ex.: ponto obtido pelo endereço). */
  focus?: { longitude: number; latitude: number; zoom: number; key: number } | null;
  /** Polígonos (áreas) desenhados com a cor do tipo; o mapa é enquadrado neles na primeira exibição. */
  polygons?: Array<{ id: string; geometry: { type: 'Polygon'; coordinates: number[][][] }; color: string }>;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Mapa MapLibre com alternância Mapa/Satélite, marcadores e seleção de ponto por clique. */
export function MapView({ height = 400, points = [], selected, onPick, initialBasemap = 'streets', onPointClick, focus, polygons }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const selectedMarker = useRef<Marker | null>(null);
  const pickRef = useRef(onPick);
  const pointClickRef = useRef(onPointClick);
  const [basemap, setBasemap] = useState(initialBasemap);
  const fitted = useRef(false);

  pickRef.current = onPick;
  pointClickRef.current = onPointClick;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: buildStyle(initialBasemap),
      center: selected ? [selected.longitude, selected.latitude] : BRAZIL_CENTER,
      zoom: selected ? 15 : 3.4,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    m.on('click', (e) => pickRef.current?.({ longitude: e.lngLat.lng, latitude: e.lngLat.lat }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Troca de mapa base
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => BASEMAPS.forEach((b) => m.setLayoutProperty(`basemap-${b.id}`, 'visibility', b.id === basemap ? 'visible' : 'none'));
    if (m.isStyleLoaded()) apply();
    else m.once('load', apply);
  }, [basemap]);

  // Marcadores
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = points.map((p) => {
      const popup = new maplibregl.Popup({ offset: 24, closeButton: false }).setHTML(
        `<strong>${escapeHtml(p.title)}</strong>${p.subtitle ? `<br><span style="color:#666">${escapeHtml(p.subtitle)}</span>` : ''}`,
      );
      const mk = new maplibregl.Marker({ color: '#1d5c3f' }).setLngLat([p.longitude, p.latitude]).setPopup(popup).addTo(m);
      const el = mk.getElement();
      el.style.cursor = 'pointer';
      el.setAttribute('aria-label', p.title);
      el.addEventListener('mouseenter', () => mk.togglePopup());
      el.addEventListener('mouseleave', () => mk.togglePopup());
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pointClickRef.current?.(p);
      });
      return mk;
    });
    if (points.length && !fitted.current) {
      fitted.current = true;
      if (points.length === 1) m.jumpTo({ center: [points[0].longitude, points[0].latitude], zoom: 13 });
      else {
        const bounds = new maplibregl.LngLatBounds();
        points.forEach((p) => bounds.extend([p.longitude, p.latitude]));
        m.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 });
      }
    }
  }, [points]);

  // Ponto selecionado (editável)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!selected) {
      selectedMarker.current?.remove();
      selectedMarker.current = null;
      return;
    }
    if (!selectedMarker.current) {
      selectedMarker.current = new maplibregl.Marker({ color: '#c2410c', draggable: !!pickRef.current })
        .setLngLat([selected.longitude, selected.latitude])
        .addTo(m);
      selectedMarker.current.on('dragend', () => {
        const ll = selectedMarker.current!.getLngLat();
        pickRef.current?.({ longitude: ll.lng, latitude: ll.lat });
      });
      m.jumpTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(m.getZoom(), 15) });
    } else {
      selectedMarker.current.setLngLat([selected.longitude, selected.latitude]);
    }
  }, [selected?.latitude, selected?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polígonos
  const polygonsFitted = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !polygons) return;
    const apply = () => {
      const data = {
        type: 'FeatureCollection' as const,
        features: polygons.map((p) => ({ type: 'Feature' as const, geometry: p.geometry, properties: { id: p.id, color: p.color } })),
      };
      const source = m.getSource('polygons') as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        m.addSource('polygons', { type: 'geojson', data });
        m.addLayer({ id: 'polygons-fill', type: 'fill', source: 'polygons', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } });
        m.addLayer({ id: 'polygons-line', type: 'line', source: 'polygons', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
      }
      if (polygons.length && !polygonsFitted.current) {
        polygonsFitted.current = true;
        const bounds = new maplibregl.LngLatBounds();
        polygons.forEach((p) => p.geometry.coordinates[0].forEach(([x, y]) => bounds.extend([x, y])));
        m.fitBounds(bounds, { padding: 40, maxZoom: 18, duration: 0 });
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once('load', apply);
  }, [polygons]);

  // Centralização solicitada pelo formulário
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.flyTo({ center: [focus.longitude, focus.latitude], zoom: focus.zoom, duration: 1200 });
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-container" style={{ height }}>
      <div ref={container} style={{ position: 'absolute', inset: 0, cursor: onPick ? 'crosshair' : undefined }} />
      <SegmentedControl
        className="map-basemap-toggle"
        size="xs"
        value={basemap}
        onChange={setBasemap}
        data={BASEMAPS.map((b) => ({ value: b.id, label: b.label }))}
        aria-label="Mapa base"
      />
    </div>
  );
}
