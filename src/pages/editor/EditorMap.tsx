import { SegmentedControl } from '@mantine/core';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { Area, PolygonGeometry } from '../../api/types';
import type { LngLat } from '../../lib/geodesy';
import { BASEMAPS, BRAZIL_CENTER, buildStyle } from '../../map/basemaps';
import { symbolSvg, type SymbolShape } from '../../lib/symbols';

export type EditorMode = 'view' | 'draw' | 'edit' | 'measure' | 'place';

export interface ElementMarker {
  id: string;
  name: string;
  position: LngLat;
  shape: SymbolShape;
  color: string;
  code: string;
}

interface Props {
  areas: Area[];
  /** Área em edição: some da camada de áreas e aparece como rascunho. */
  editingAreaId: string | null;
  selectedAreaId: string | null;
  onSelectArea: (id: string | null) => void;
  mode: EditorMode;
  ring: LngLat[];
  holes: LngLat[][];
  closed: boolean;
  /** Mostra os vértices numerados (também em modo de visualização, para conferência). */
  showVertices: boolean;
  selectedVertex: number | null;
  onSelectVertex: (index: number | null) => void;
  onAddVertex: (point: LngLat) => void;
  onCloseRing: () => void;
  onMoveVertex: (index: number, point: LngLat) => void;
  onInsertVertex: (index: number, point: LngLat) => void;
  onRemoveVertex: (index: number) => void;
  measure: LngLat[];
  onMeasureAdd: (point: LngLat) => void;
  ghost: PolygonGeometry | null;
  onCursor: (point: LngLat | null) => void;
  fit: { key: number; bounds: [LngLat, LngLat] } | null;
  center: LngLat | null;
  /** Elementos pontuais (símbolos). */
  elements: ElementMarker[];
  selectedElementId: string | null;
  /** Elemento que pode ser arrastado (selecionado e editável). */
  draggableElementId: string | null;
  onSelectElement: (id: string) => void;
  onMoveElement: (id: string, point: LngLat) => void;
  /** Clique no mapa no modo "posicionar elemento". */
  onPlace: (point: LngLat) => void;
}

const DRAFT_COLOR = '#f97316';
/** Acima disso os vértices viram uma camada simples (sem marcadores arrastáveis), por desempenho. */
const MAX_HTML_VERTICES = 400;

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const closeRing = (r: LngLat[]) => [...r, r[0]];

/** Mapa do editor geográfico: áreas por tipo, rascunho editável, medição e comparação de versões. */
export function EditorMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState('satellite');
  const markers = useRef<Marker[]>([]);
  const cursorRef = useRef<LngLat | null>(null);

  // ── Inicialização ──
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: buildStyle('satellite'),
      center: props.center ?? BRAZIL_CENTER,
      zoom: props.center ? 16 : 3.4,
      attributionControl: { compact: true },
      doubleClickZoom: false,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 140 }), 'bottom-left');

    m.on('load', () => {
      const empty = fc([]);
      ['areas', 'ghost', 'draft', 'rubber', 'measure', 'vertex-dots'].forEach((id) => m.addSource(id, { type: 'geojson', data: empty }));
      m.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'selected'], 0.38, 0.22] } });
      m.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 3.5, 2] } });
      m.addLayer({ id: 'ghost-line', type: 'line', source: 'ghost', paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': DRAFT_COLOR, 'fill-opacity': 0.25 } });
      m.addLayer({ id: 'draft-casing', type: 'line', source: 'draft', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 } });
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': DRAFT_COLOR, 'line-width': 2.5 } });
      m.addLayer({ id: 'rubber-line', type: 'line', source: 'rubber', paint: { 'line-color': DRAFT_COLOR, 'line-width': 2, 'line-dasharray': [1.5, 1.5] } });
      m.addLayer({ id: 'vertex-dots', type: 'circle', source: 'vertex-dots', paint: { 'circle-radius': 3.5, 'circle-color': '#fff', 'circle-stroke-color': DRAFT_COLOR, 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'measure-line', type: 'line', source: 'measure', paint: { 'line-color': '#facc15', 'line-width': 3, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'measure-points', type: 'circle', source: 'measure', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#facc15', 'circle-stroke-color': '#000', 'circle-stroke-width': 1 } });
      setReady(true);
    });

    m.on('click', (e) => {
      const p = latest.current;
      const point: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (p.mode === 'draw') {
        // Ignora o 2º clique do duplo clique (mesmo lugar do último vértice)
        const last = p.ring[p.ring.length - 1];
        if (last) {
          const px = m.project(last);
          if (Math.hypot(px.x - e.point.x, px.y - e.point.y) < 5) return;
        }
        p.onAddVertex(point);
        return;
      }
      if (p.mode === 'measure') return p.onMeasureAdd(point);
      if (p.mode === 'place') return p.onPlace(point);
      if (p.mode === 'edit') return p.onSelectVertex(null);
      const hit = m.queryRenderedFeatures(e.point, { layers: ['areas-fill'] })[0];
      p.onSelectArea((hit?.properties?.id as string) ?? null);
    });
    m.on('dblclick', (e) => {
      if (latest.current.mode === 'draw') {
        e.preventDefault();
        latest.current.onCloseRing();
      }
    });

    let frame = 0;
    m.on('mousemove', (e) => {
      cursorRef.current = [e.lngLat.lng, e.lngLat.lat];
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const p = latest.current;
        p.onCursor(cursorRef.current);
        updateRubber(m, p, cursorRef.current);
        if (p.mode === 'view') {
          const over = m.getLayer('areas-fill') && m.queryRenderedFeatures(e.point, { layers: ['areas-fill'] }).length > 0;
          m.getCanvas().style.cursor = over ? 'pointer' : '';
        }
      });
    });
    m.getCanvas().addEventListener('mouseleave', () => {
      cursorRef.current = null;
      latest.current.onCursor(null);
      updateRubber(m, latest.current, null);
    });

    map.current = m;
    return () => {
      markers.current.forEach((mk) => mk.remove());
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mapa base ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    BASEMAPS.forEach((b) => m.setLayoutProperty(`basemap-${b.id}`, 'visibility', b.id === basemap ? 'visible' : 'none'));
  }, [basemap, ready]);

  // ── Cursor conforme o modo ──
  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = props.mode === 'draw' || props.mode === 'measure' || props.mode === 'place' ? 'crosshair' : '';
  }, [props.mode]);

  // ── Áreas ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const features = props.areas
      .filter((a) => a.id !== props.editingAreaId)
      .map((a) => ({
        type: 'Feature' as const,
        geometry: a.currentVersion.geometry,
        properties: { id: a.id, color: a.areaType.color, selected: a.id === props.selectedAreaId },
      }));
    (m.getSource('areas') as GeoJSONSource).setData(fc(features));
  }, [props.areas, props.editingAreaId, props.selectedAreaId, ready]);

  // ── Versão para comparação ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('ghost') as GeoJSONSource).setData(fc(props.ghost ? [{ type: 'Feature', geometry: props.ghost, properties: {} }] : []));
  }, [props.ghost, ready]);

  // ── Rascunho (polígono/linha) ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    setDraft(m, props.mode === 'view' ? [] : props.ring, props.holes, props.closed);
    updateRubber(m, props, cursorRef.current);
  }, [props.ring, props.holes, props.closed, props.mode, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Medição ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const pts = props.measure;
    (m.getSource('measure') as GeoJSONSource).setData(fc([
      ...(pts.length > 1 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: pts }, properties: {} }] : []),
      ...pts.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} })),
    ]));
  }, [props.measure, ready]);

  // ── Vértices numerados e pontos médios (inserção) ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const { ring, mode, closed, selectedVertex, showVertices } = props;
    const dots = m.getSource('vertex-dots') as GeoJSONSource;
    dots.setData(fc([]));
    if (!showVertices || !ring.length) return;

    const editable = mode === 'edit' || mode === 'draw';
    if (ring.length > MAX_HTML_VERTICES) {
      dots.setData(fc(ring.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} }))));
      return;
    }

    ring.forEach((coord, i) => {
      const el = document.createElement('div');
      el.className = 'vx';
      if (i === selectedVertex) el.classList.add('vx-selected');
      if (mode === 'draw' && i === 0 && ring.length >= 3) el.classList.add('vx-closable');
      el.textContent = String(i + 1);
      el.title = mode === 'draw' && i === 0 && ring.length >= 3 ? 'Clique para fechar o polígono' : `Vértice ${i + 1}`;
      let dragged = false;
      const mk = new maplibregl.Marker({ element: el, draggable: editable }).setLngLat(coord).addTo(m);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (dragged) return;
        const p = latest.current;
        if (p.mode === 'draw' && i === 0 && p.ring.length >= 3) p.onCloseRing();
        else p.onSelectVertex(i);
      });
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if (latest.current.mode === 'edit') latest.current.onRemoveVertex(i);
      });
      mk.on('dragstart', () => {
        dragged = true;
        markers.current.forEach((other) => other.getElement().classList.contains('vx-mid') && (other.getElement().style.display = 'none'));
      });
      mk.on('drag', () => {
        const ll = mk.getLngLat();
        const preview = latest.current.ring.map((c, j) => (j === i ? ([ll.lng, ll.lat] as LngLat) : c));
        setDraft(m, preview, latest.current.holes, latest.current.closed);
      });
      mk.on('dragend', () => {
        const ll = mk.getLngLat();
        latest.current.onMoveVertex(i, [ll.lng, ll.lat]);
        setTimeout(() => (dragged = false), 0);
      });
      markers.current.push(mk);
    });

    if (mode === 'edit' && closed) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const el = document.createElement('div');
        el.className = 'vx-mid';
        el.title = 'Clique ou arraste para inserir um vértice';
        let dragged = false;
        const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(mid).addTo(m);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (!dragged) latest.current.onInsertVertex(i + 1, mid);
        });
        mk.on('dragstart', () => (dragged = true));
        mk.on('dragend', () => {
          const ll = mk.getLngLat();
          latest.current.onInsertVertex(i + 1, [ll.lng, ll.lat]);
        });
        markers.current.push(mk);
      });
    }
  }, [props.ring, props.mode, props.closed, props.selectedVertex, props.showVertices, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Elementos pontuais ──
  const elementMarkers = useRef<Marker[]>([]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    elementMarkers.current.forEach((mk) => mk.remove());
    elementMarkers.current = props.elements.map((el) => {
      const wrapper = document.createElement('div');
      wrapper.className = `el-marker${el.id === props.selectedElementId ? ' el-selected' : ''}`;
      wrapper.innerHTML = symbolSvg(el.shape, el.color, el.code, 24);
      const label = document.createElement('span');
      label.className = 'el-label';
      label.textContent = el.name;
      wrapper.appendChild(label);
      wrapper.title = el.name;
      wrapper.setAttribute('aria-label', `Elemento ${el.name}`);
      const draggable = el.id === props.draggableElementId;
      const mk = new maplibregl.Marker({ element: wrapper, draggable, anchor: 'center', offset: [0, 0] }).setLngLat(el.position).addTo(m);
      let dragged = false;
      wrapper.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!dragged && latest.current.mode !== 'draw' && latest.current.mode !== 'measure') latest.current.onSelectElement(el.id);
      });
      mk.on('dragstart', () => (dragged = true));
      mk.on('dragend', () => {
        const ll = mk.getLngLat();
        latest.current.onMoveElement(el.id, [ll.lng, ll.lat]);
        setTimeout(() => (dragged = false), 0);
      });
      return mk;
    });
  }, [props.elements, props.selectedElementId, props.draggableElementId, ready]);

  // ── Enquadramento ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !props.fit) return;
    const [sw, ne] = props.fit.bounds;
    if (sw[0] === ne[0] && sw[1] === ne[1]) m.flyTo({ center: sw, zoom: Math.max(m.getZoom(), 16) });
    else m.fitBounds([sw, ne], { padding: 80, maxZoom: 18, duration: 800 });
  }, [props.fit?.key, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={container} data-testid="editor-map" style={{ position: 'absolute', inset: 0 }} />
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

function setDraft(m: MlMap, ring: LngLat[], holes: LngLat[][], closed: boolean) {
  const source = m.getSource('draft') as GeoJSONSource | undefined;
  if (!source) return;
  let feature: GeoJSON.Feature | null = null;
  if (closed && ring.length >= 3) {
    feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [closeRing(ring), ...holes.map(closeRing)] }, properties: {} };
  } else if (ring.length >= 2) {
    feature = { type: 'Feature', geometry: { type: 'LineString', coordinates: ring }, properties: {} };
  }
  source.setData(fc(feature ? [feature] : []));
}

/** Linha elástica do último vértice até o cursor (e de volta ao primeiro) durante o desenho. */
function updateRubber(m: MlMap, p: Props, cursor: LngLat | null) {
  const source = m.getSource('rubber') as GeoJSONSource | undefined;
  if (!source) return;
  if (p.mode !== 'draw' || p.closed || !cursor || !p.ring.length) return source.setData(fc([]));
  const coords = p.ring.length >= 2 ? [p.ring[p.ring.length - 1], cursor, p.ring[0]] : [p.ring[0], cursor];
  source.setData(fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }]));
}
