import { ActionIcon, Box, Button, Divider, Group, Menu, Paper, ScrollArea, Tabs, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconClipboardText, IconDownload, IconFileImport, IconPencil,
  IconMapPinPlus, IconPolygon, IconRuler2, IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, download } from '../../api/client';
import type { Area, AreaSourceMethod, AreaType, AreaVersion, ElementType, Enterprise, MapElement, PolygonGeometry } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { LoadingBlock } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { axisLabels, epsgOf, formatPair, suggestedUtm, type Crs } from '../../lib/crs';
import { centroid, formatMeters, lineLength, type LngLat } from '../../lib/geodesy';
import { NotFoundPage } from '../NotFoundPage';
import { AreaPanel, type NewAreaForm } from './AreaPanel';
import { CrsSelect } from './CrsSelect';
import { EditorMap, type EditorMode, type ElementMarker } from './EditorMap';
import { ElementPanel, suggestName, SymbolIcon, type ElementForm } from './ElementPanel';
import { ImportModal, type ImportItem } from './ImportModal';
import { LayersPanel } from './LayersPanel';
import { PasteCoordinatesModal } from './PasteCoordinatesModal';
import { useUndoable } from './useUndoable';
import { VersionsPanel } from './VersionsPanel';

interface DraftMeta {
  /** null = área nova */
  areaId: string | null;
  holes: LngLat[][];
  baseVersion: number | null;
  sourceMethod: AreaSourceMethod;
  coordinateSystem?: string;
  original: string;
}

interface Geom {
  ring: LngLat[];
  closed: boolean;
}

const EMPTY: Geom = { ring: [], closed: false };
const NO_HOLES: LngLat[][] = [];
const openRing = (coords: number[][]) => {
  const r = coords.map(([x, y]) => [x, y] as LngLat);
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  return r;
};
const closeRing = (r: LngLat[]) => [...r, r[0]];

function boundsOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }
  return [[w, s], [e, n]];
}

const HINTS: Record<EditorMode, string> = {
  view: '',
  draw: 'Clique no mapa para adicionar vértices. Para fechar: clique no vértice 1, duplo clique ou Enter. Ctrl+Z desfaz.',
  edit: 'Arraste os vértices para ajustar. Clique (ou arraste) os pontos intermediários para inserir. Botão direito ou Delete remove o vértice selecionado.',
  measure: 'Clique para medir distâncias. Esc encerra a medição.',
  place: 'Clique no mapa para posicionar o elemento. Esc cancela.',
};
const DRAFT_ELEMENT = '__novo__';

/** Editor geográfico do empreendimento (Épico 06, seção 10.1): toolbar, mapa, painel lateral e rodapé. */
export function EditorPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = can('areas.write');
  const canValidate = can('areas.validate');
  const narrow = useMediaQuery('(max-width: 900px)');
  const navigate = useNavigate();
  /** Coordenada do cursor vai direto ao rodapé (sem rerenderizar a página a cada movimento do mouse). */
  const cursorListeners = useRef(new Set<(p: LngLat | null) => void>());
  const publishCursor = useCallback((p: LngLat | null) => cursorListeners.current.forEach((fn) => fn(p)), []);

  const enterpriseQ = useQuery({ queryKey: ['enterprise', id], queryFn: () => api.get<Enterprise>(`/enterprises/${id}`) });
  const areasQ = useQuery({ queryKey: ['areas', id], queryFn: () => api.get<Area[]>(`/enterprises/${id}/areas`, { includeArchived: true }) });
  const typesQ = useQuery({ queryKey: ['area-types'], queryFn: () => api.get<AreaType[]>('/area-types') });
  const elementsQ = useQuery({ queryKey: ['elements', id], queryFn: () => api.get<MapElement[]>(`/enterprises/${id}/elements`, { includeArchived: true }) });
  const elementTypesQ = useQuery({ queryKey: ['element-types'], queryFn: () => api.get<ElementType[]>('/element-types') });

  const [showArchived, setShowArchived] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('view');
  const geom = useUndoable<Geom>(EMPTY);
  const [draft, setDraft] = useState<DraftMeta | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [measure, setMeasure] = useState<LngLat[]>([]);
  const [crs, setCrs] = useState<Crs | null>(null);
  const [compare, setCompare] = useState<AreaVersion | null>(null);
  const [fit, setFit] = useState<{ key: number; bounds: [LngLat, LngLat] } | null>(null);
  const [tab, setTab] = useState<string | null>('layers');
  const [newArea, setNewArea] = useState<NewAreaForm>({ name: '', areaTypeId: null, notes: '' });
  const [versionNotes, setVersionNotes] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [pasteFor, setPasteFor] = useState<'new' | 'replace' | null>(null);
  const [hiddenElementTypes, setHiddenElementTypes] = useState<Set<string>>(new Set());
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [elementForm, setElementForm] = useState<ElementForm | null>(null);
  const [placingTypeId, setPlacingTypeId] = useState<string | null>(null);

  const allAreas = useMemo(() => areasQ.data ?? [], [areasQ.data]);
  const listed = useMemo(() => allAreas.filter((a) => showArchived || a.status === 'ACTIVE'), [allAreas, showArchived]);
  const visible = useMemo(() => listed.filter((a) => !hiddenTypes.has(a.areaType.id)), [listed, hiddenTypes]);
  const selected = allAreas.find((a) => a.id === selectedId) ?? null;
  const types = typesQ.data ?? [];
  const editing = !!draft;
  const selectedRing = useMemo(() => (selected ? openRing(selected.currentVersion.geometry.coordinates[0]) : []), [selected]);
  const ring = editing ? geom.value.ring : selectedRing;
  const closed = editing ? geom.value.closed : !!selected;
  const holes = editing ? draft.holes : NO_HOLES;
  const dirty = editing && JSON.stringify(geom.value) !== draft.original;
  const allElements = useMemo(() => elementsQ.data ?? [], [elementsQ.data]);
  const listedElements = useMemo(() => allElements.filter((e) => showArchived || e.status === 'ACTIVE'), [allElements, showArchived]);
  const selectedElement = allElements.find((e) => e.id === selectedElementId) ?? null;
  const elementTypes = useMemo(() => elementTypesQ.data ?? [], [elementTypesQ.data]);
  const elementMarkers = useMemo<ElementMarker[]>(() => {
    const list: ElementMarker[] = listedElements
      .filter((e) => !hiddenElementTypes.has(e.elementTypeId))
      .map((e) => {
        const editingThis = e.id === selectedElementId && !!elementForm;
        const pos: LngLat = editingThis ? elementForm!.position : [e.longitude, e.latitude];
        const t = editingThis ? elementTypes.find((x) => x.id === elementForm!.elementTypeId) ?? e.elementType : e.elementType;
        return { id: e.id, name: editingThis ? elementForm!.name || e.name : e.name, position: pos, shape: t.shape, color: t.color, code: t.code };
      });
    if (elementForm && !selectedElementId) {
      const t = elementTypes.find((x) => x.id === elementForm.elementTypeId);
      if (t) list.push({ id: DRAFT_ELEMENT, name: elementForm.name || 'novo', position: elementForm.position, shape: t.shape, color: t.color, code: t.code });
    }
    return list;
  }, [listedElements, hiddenElementTypes, selectedElementId, elementForm, elementTypes]);
  const enterprisePoint: LngLat | null = enterpriseQ.data?.longitude != null && enterpriseQ.data.latitude != null ? [enterpriseQ.data.longitude, enterpriseQ.data.latitude] : null;

  // Sistema de coordenadas inicial: UTM da zona do empreendimento (ou das áreas)
  useEffect(() => {
    if (crs || !enterpriseQ.data || !areasQ.data) return;
    const ref = enterprisePoint ?? centroid(areasQ.data.flatMap((a) => openRing(a.currentVersion.geometry.coordinates[0])));
    setCrs(suggestedUtm(ref));
  }, [enterpriseQ.data, areasQ.data, crs, enterprisePoint]);

  // Enquadra todas as áreas ao abrir
  useEffect(() => {
    if (!areasQ.data || fit) return;
    const b = boundsOf(areasQ.data.filter((a) => a.status === 'ACTIVE').flatMap((a) => openRing(a.currentVersion.geometry.coordinates[0])));
    if (b) setFit({ key: Date.now(), bounds: b });
  }, [areasQ.data, fit]);

  // Aviso ao sair da página com edição não salva
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['areas', id] });
    queryClient.invalidateQueries({ queryKey: ['area-types'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
    queryClient.invalidateQueries({ queryKey: ['elements', id] });
  };

  const closeElement = () => {
    setSelectedElementId(null);
    setElementForm(null);
    setPlacingTypeId(null);
  };

  const formOf = (e: MapElement): ElementForm => ({
    elementTypeId: e.elementTypeId, name: e.name, specification: e.specification ?? '', notes: e.notes ?? '', position: [e.longitude, e.latitude],
  });

  /** Executa a ação, pedindo confirmação se houver edição não salva. */
  const guard = (action: () => void) => {
    if (!dirty) return action();
    modals.openConfirmModal({
      title: 'Descartar alterações?',
      children: <Text fz="sm">A geometria em edição ainda não foi salva. Deseja descartá-la?</Text>,
      labels: { confirm: 'Descartar', cancel: 'Continuar editando' },
      confirmProps: { color: 'red' },
      onConfirm: action,
    });
  };

  const stopEditing = useCallback(() => {
    setDraft(null);
    geom.reset(EMPTY);
    setSelectedVertex(null);
    setVersionNotes('');
    setMode('view');
  }, [geom]);

  const focusArea = (area: Area) => {
    const b = boundsOf(openRing(area.currentVersion.geometry.coordinates[0]));
    if (b) setFit({ key: Date.now(), bounds: b });
  };

  const selectArea = (areaId: string | null, focus = false) => {
    if (areaId === selectedId && !editing) return;
    guard(() => {
      stopEditing();
      closeElement();
      setCompare(null);
      setSelectedId(areaId);
      if (areaId) {
        setTab('area');
        const area = allAreas.find((a) => a.id === areaId);
        if (focus && area) focusArea(area);
      }
    });
  };

  const startNew = (initial?: { ring: LngLat[]; sourceMethod: AreaSourceMethod; coordinateSystem?: string }) => {
    guard(() => {
      closeElement();
      setSelectedId(null);
      setCompare(null);
      setMeasure([]);
      const g = initial ? { ring: initial.ring, closed: true } : EMPTY;
      setDraft({ areaId: null, holes: [], baseVersion: null, sourceMethod: initial?.sourceMethod ?? 'MANUAL_WEB', coordinateSystem: initial?.coordinateSystem, original: JSON.stringify(EMPTY) });
      geom.reset(g);
      setNewArea((n) => ({ name: '', notes: '', areaTypeId: n.areaTypeId && types.some((t) => t.id === n.areaTypeId) ? n.areaTypeId : types[0]?.id ?? null }));
      setVersionNotes('');
      setSelectedVertex(null);
      setMode(initial ? 'edit' : 'draw');
      setTab('area');
      if (initial) {
        const b = boundsOf(initial.ring);
        if (b) setFit({ key: Date.now(), bounds: b });
      }
    });
  };

  const startEdit = (fromVersion?: AreaVersion) => {
    if (!selected) return;
    const source = fromVersion?.geometry ?? selected.currentVersion.geometry;
    const [outer, ...inner] = source.coordinates;
    const g: Geom = { ring: openRing(outer), closed: true };
    setDraft({
      areaId: selected.id,
      holes: inner.map(openRing),
      baseVersion: selected.currentVersion.version,
      sourceMethod: fromVersion?.sourceMethod ?? 'MANUAL_WEB',
      coordinateSystem: fromVersion?.coordinateSystem ?? undefined,
      // Restaurar versão antiga já conta como alteração a salvar
      original: fromVersion ? '' : JSON.stringify(g),
    });
    geom.reset(g);
    setSelectedVertex(null);
    setVersionNotes(fromVersion ? `Restauração da geometria da V${fromVersion.version}` : '');
    setMode('edit');
    setTab('area');
    setCompare(null);
  };

  // ── Operações de geometria ──
  const addVertex = (p: LngLat) => geom.set((g) => ({ ...g, ring: [...g.ring, p] }));
  const closeDrawing = () => {
    if (geom.value.ring.length < 3) return notifyError(null, 'O polígono precisa de pelo menos 3 vértices');
    geom.set((g) => ({ ...g, closed: true }));
    setMode('edit');
  };
  const moveVertex = (i: number, p: LngLat) => geom.set((g) => ({ ...g, ring: g.ring.map((c, j) => (j === i ? p : c)) }));
  const insertVertex = (i: number, p: LngLat) => {
    geom.set((g) => ({ ...g, ring: [...g.ring.slice(0, i), p, ...g.ring.slice(i)] }));
    setSelectedVertex(i);
  };
  const insertAfter = (i: number) => {
    const r = geom.value.ring;
    const a = r[i];
    const b = r[(i + 1) % r.length];
    insertVertex(i + 1, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  };
  const removeVertex = (i: number) => {
    if (geom.value.closed && geom.value.ring.length <= 3) return notifyError(null, 'O polígono precisa de pelo menos 3 vértices');
    geom.set((g) => ({ ...g, ring: g.ring.filter((_, j) => j !== i) }));
    setSelectedVertex(null);
  };

  const applyPaste = (points: LngLat[], pasteCrs: Crs) => {
    const coordinateSystem = `EPSG:${epsgOf(pasteCrs)}`;
    if (pasteFor === 'new') return startNew({ ring: points, sourceMethod: 'VERTEX_LIST', coordinateSystem });
    geom.set({ ring: points, closed: true });
    setDraft((d) => (d ? { ...d, sourceMethod: 'VERTEX_LIST', coordinateSystem } : d));
    const b = boundsOf(points);
    if (b) setFit({ key: Date.now(), bounds: b });
  };

  // ── Persistência ──
  const save = useMutation({
    mutationFn: async () => {
      const d = draft!;
      const geometry: PolygonGeometry = { type: 'Polygon', coordinates: [closeRing(geom.value.ring), ...d.holes.map(closeRing)] };
      const common = {
        geometry,
        sourceMethod: d.sourceMethod,
        coordinateSystem: d.coordinateSystem ?? (crs ? `EPSG:${epsgOf(crs)}` : undefined),
        versionNotes: versionNotes.trim() || undefined,
      };
      if (d.areaId) return api.post<Area>(`/areas/${d.areaId}/versions`, { ...common, baseVersion: d.baseVersion });
      return api.post<Area>(`/enterprises/${id}/areas`, { ...common, areaTypeId: newArea.areaTypeId, name: newArea.name.trim(), notes: newArea.notes.trim() || undefined });
    },
    onSuccess: (area) => {
      queryClient.setQueryData<Area[]>(['areas', id], (list) => (list ? [...list.filter((a) => a.id !== area.id), area] : [area]));
      refresh();
      stopEditing();
      setSelectedId(area.id);
      notifySuccess(area.currentVersion.version === 1 ? `Área "${area.name}" salva (V1)` : `Versão V${area.currentVersion.version} salva — as anteriores foram preservadas`);
    },
    onError: (e) => notifyError(e),
  });

  const patch = useMutation({
    mutationFn: ({ areaId, body }: { areaId: string; body: object }) => api.patch<Area>(`/areas/${areaId}`, body),
    onSuccess: () => { refresh(); notifySuccess('Dados da área atualizados'); },
    onError: (e) => notifyError(e),
  });

  const validate = useMutation({
    mutationFn: ({ areaId, version }: { areaId: string; version: number }) => api.post<Area>(`/areas/${areaId}/versions/${version}/validate`),
    onSuccess: (a) => { refresh(); notifySuccess(`Versão V${a.validatedVersion} validada`); },
    onError: (e) => notifyError(e),
  });

  const archive = useMutation({
    mutationFn: ({ areaId, archive: arch }: { areaId: string; archive: boolean }) => api.post<Area>(`/areas/${areaId}/${arch ? 'archive' : 'restore'}`),
    onSuccess: (_a, v) => {
      refresh();
      notifySuccess(v.archive ? 'Área arquivada (o histórico é preservado)' : 'Área restaurada');
      if (v.archive && !showArchived) setSelectedId(null);
    },
    onError: (e) => notifyError(e),
  });

  const confirmValidate = (version: number) => {
    if (!selected) return;
    modals.openConfirmModal({
      title: `Validar V${version}`,
      children: <Text fz="sm">Registrar a revisão técnica da versão V{version} de <b>{selected.name}</b>? A última versão validada é a que alimenta a planta.</Text>,
      labels: { confirm: 'Validar', cancel: 'Cancelar' },
      onConfirm: () => validate.mutate({ areaId: selected.id, version }),
    });
  };

  const runImport = async (items: ImportItem[]) => {
    let ok = 0;
    const failures: string[] = [];
    for (const item of items) {
      try {
        const [outer, ...inner] = item.rings;
        await api.post<Area>(`/enterprises/${id}/areas`, {
          areaTypeId: item.areaTypeId,
          name: item.name,
          geometry: { type: 'Polygon', coordinates: [closeRing(outer), ...inner.map(closeRing)] },
          sourceMethod: 'IMPORT_FILE',
          coordinateSystem: item.coordinateSystem,
        });
        ok += 1;
      } catch (e) {
        failures.push(`${item.name}: ${e instanceof ApiError ? e.message : 'erro'}`);
      }
    }
    refresh();
    if (ok) notifySuccess(`${ok} área(s) importada(s)`);
    if (failures.length) notifyError(new ApiError(400, `Não importadas: ${failures.join(' | ')}`));
    const b = boundsOf(items.flatMap((i) => i.rings[0]));
    if (b) setFit({ key: Date.now(), bounds: b });
    setTab('layers');
  };

  // ── Elementos pontuais ──
  const selectElement = (elementId: string, focus = false) => {
    if (elementId === DRAFT_ELEMENT) return;
    guard(() => {
      stopEditing();
      setSelectedId(null);
      setCompare(null);
      const el = allElements.find((e) => e.id === elementId);
      if (!el) return;
      setSelectedElementId(el.id);
      setElementForm(formOf(el));
      setTab('area');
      if (focus) setFit({ key: Date.now(), bounds: [[el.longitude, el.latitude], [el.longitude, el.latitude]] });
    });
  };

  const startPlacing = (typeId: string) => {
    guard(() => {
      stopEditing();
      setSelectedId(null);
      closeElement();
      setPlacingTypeId(typeId);
      setMode('place');
    });
  };

  const placeElement = (p: LngLat) => {
    const type = elementTypes.find((t) => t.id === placingTypeId);
    if (!type) return;
    setElementForm({ elementTypeId: type.id, name: suggestName(type, allElements), specification: '', notes: '', position: p });
    setSelectedElementId(null);
    setPlacingTypeId(null);
    setMode('view');
    setTab('area');
  };

  const moveElement = (elementId: string, p: LngLat) => {
    if (elementForm && (elementId === DRAFT_ELEMENT || elementId === selectedElementId)) setElementForm({ ...elementForm, position: p });
  };

  const saveElement = useMutation({
    mutationFn: () => {
      const f = elementForm!;
      const body = {
        elementTypeId: f.elementTypeId, name: f.name.trim(),
        specification: f.specification.trim() || (selectedElementId ? null : undefined), notes: f.notes.trim() || (selectedElementId ? null : undefined),
        latitude: Math.round(f.position[1] * 1e7) / 1e7, longitude: Math.round(f.position[0] * 1e7) / 1e7,
      };
      return selectedElementId ? api.patch<MapElement>(`/elements/${selectedElementId}`, body) : api.post<MapElement>(`/enterprises/${id}/elements`, body);
    },
    onSuccess: (el) => {
      queryClient.setQueryData<MapElement[]>(['elements', id], (list) => (list ? [...list.filter((e) => e.id !== el.id), el] : [el]));
      refresh();
      setSelectedElementId(el.id);
      setElementForm(formOf(el));
      notifySuccess(`Elemento ${el.name} salvo`);
    },
    onError: (e) => notifyError(e),
  });

  const archiveElement = useMutation({
    mutationFn: (archiveIt: boolean) => api.post<MapElement>(`/elements/${selectedElementId}/${archiveIt ? 'archive' : 'restore'}`),
    onSuccess: (el, archiveIt) => {
      refresh();
      notifySuccess(archiveIt ? `Elemento ${el.name} arquivado` : `Elemento ${el.name} restaurado`);
      if (archiveIt && !showArchived) closeElement();
    },
    onError: (e) => notifyError(e),
  });

  const exportAreas = (format: 'geojson' | 'kml', source: 'current' | 'validated') =>
    download(`/enterprises/${id}/areas/export`, { format, source }).catch((e) => notifyError(e));

  // ── Atalhos de teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (editing && ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); geom.undo(); }
      else if (editing && ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); geom.redo(); }
      else if (mode === 'draw' && e.key === 'Enter') closeDrawing();
      else if (mode === 'edit' && (e.key === 'Delete' || e.key === 'Backspace') && selectedVertex != null) { e.preventDefault(); removeVertex(selectedVertex); }
      else if (e.key === 'Escape') {
        if (mode === 'measure') { setMeasure([]); setMode(editing ? 'edit' : 'view'); }
        else if (mode === 'place') { setPlacingTypeId(null); setMode('view'); }
        else if (mode === 'draw' && !geom.value.ring.length) stopEditing();
        else setSelectedVertex(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (enterpriseQ.isError) return <NotFoundPage />;
  if (enterpriseQ.isLoading || areasQ.isLoading || typesQ.isLoading || elementsQ.isLoading || !crs) return <LoadingBlock />;
  const enterprise = enterpriseQ.data!;
  const measureLength = lineLength(measure);
  const zone = { zone: crs.kind === 'utm' ? crs.zone! : suggestedUtm(enterprisePoint).zone!, hemisphere: crs.kind === 'utm' ? crs.hemisphere! : suggestedUtm(enterprisePoint).hemisphere! };
  const inactiveEnterprise = enterprise.status !== 'ACTIVE';
  const writable = canWrite && !inactiveEnterprise;

  return (
    <Box h="100dvh" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Group px="sm" py={6} gap="xs" wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Tooltip label="Voltar ao empreendimento">
          <ActionIcon component={Link} to={`/empreendimentos/${id}`} variant="subtle" aria-label="Voltar ao empreendimento" onClick={(e) => { if (dirty) { e.preventDefault(); guard(() => { stopEditing(); navigate(`/empreendimentos/${id}`); }); } }}>
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <div style={{ minWidth: 0 }}>
          <Text fw={700} fz="sm" lineClamp={1}>Editor geográfico — {enterprise.name}</Text>
          <Text fz="xs" c="dimmed" lineClamp={1}>{enterprise.client.tradeName || enterprise.client.name}{enterprise.city ? ` · ${enterprise.city}/${enterprise.state}` : ''}</Text>
        </div>
        <Divider orientation="vertical" />
        {writable && (
          <>
            <Button size="xs" leftSection={<IconPolygon size={14} />} variant={mode === 'draw' ? 'filled' : 'light'} onClick={() => startNew()}>Nova área</Button>
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <Button size="xs" leftSection={<IconMapPinPlus size={14} />} variant={mode === 'place' ? 'filled' : 'light'}>Elemento</Button>
              </Menu.Target>
              <Menu.Dropdown mah={420} style={{ overflowY: 'auto' }}>
                <Menu.Label>Posicionar no mapa</Menu.Label>
                {elementTypes.map((t) => (
                  <Menu.Item key={t.id} leftSection={<SymbolIcon type={t} size={18} />} onClick={() => startPlacing(t.id)}>{t.name}</Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Button size="xs" variant={mode === 'edit' ? 'filled' : 'light'} leftSection={<IconPencil size={14} />} disabled={!selected || editing || selected.status !== 'ACTIVE'} onClick={() => startEdit()}>
              Editar vértices
            </Button>
            <Tooltip label="Desfazer (Ctrl+Z)"><ActionIcon variant="light" disabled={!editing || !geom.canUndo} onClick={geom.undo} aria-label="Desfazer"><IconArrowBackUp size={16} /></ActionIcon></Tooltip>
            <Tooltip label="Refazer (Ctrl+Y)"><ActionIcon variant="light" disabled={!editing || !geom.canRedo} onClick={geom.redo} aria-label="Refazer"><IconArrowForwardUp size={16} /></ActionIcon></Tooltip>
            {editing && <Tooltip label="Cancelar edição"><ActionIcon variant="light" color="red" onClick={() => guard(stopEditing)} aria-label="Cancelar edição"><IconX size={16} /></ActionIcon></Tooltip>}
            <Divider orientation="vertical" />
          </>
        )}
        <Button size="xs" variant={mode === 'measure' ? 'filled' : 'light'} color="yellow" leftSection={<IconRuler2 size={14} />}
          onClick={() => { if (mode === 'measure') { setMeasure([]); setMode(editing ? (geom.value.closed ? 'edit' : 'draw') : 'view'); } else { setMeasure([]); setMode('measure'); } }}>
          Medir
        </Button>
        {writable && (
          <>
            <Button size="xs" variant="light" leftSection={<IconFileImport size={14} />} onClick={() => guard(() => { stopEditing(); setImportOpen(true); })}>Importar</Button>
            <Button size="xs" variant="light" leftSection={<IconClipboardText size={14} />} onClick={() => setPasteFor('new')}>Colar coordenadas</Button>
          </>
        )}
        <Menu position="bottom-end" withinPortal>
          <Menu.Target><Button size="xs" variant="light" leftSection={<IconDownload size={14} />} disabled={!allAreas.some((a) => a.status === 'ACTIVE')}>Exportar</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Versão atual</Menu.Label>
            <Menu.Item onClick={() => exportAreas('geojson', 'current')}>GeoJSON</Menu.Item>
            <Menu.Item onClick={() => exportAreas('kml', 'current')}>KML (Google Earth)</Menu.Item>
            <Menu.Label>Última versão validada</Menu.Label>
            <Menu.Item onClick={() => exportAreas('geojson', 'validated')}>GeoJSON</Menu.Item>
            <Menu.Item onClick={() => exportAreas('kml', 'validated')}>KML (Google Earth)</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Box style={{ flex: 1, display: 'flex', flexDirection: narrow ? 'column' : 'row', minHeight: 0 }}>
        {/* Mapa */}
        <Box style={{ flex: 1, position: 'relative', minHeight: narrow ? '50vh' : 0 }}>
          <EditorMap
            areas={visible}
            editingAreaId={draft?.areaId ?? null}
            selectedAreaId={selectedId}
            onSelectArea={(aid) => selectArea(aid)}
            mode={mode}
            ring={ring}
            holes={holes}
            closed={closed}
            showVertices={editing || !!selected}
            selectedVertex={selectedVertex}
            onSelectVertex={setSelectedVertex}
            onAddVertex={addVertex}
            onCloseRing={closeDrawing}
            onMoveVertex={moveVertex}
            onInsertVertex={insertVertex}
            onRemoveVertex={removeVertex}
            measure={measure}
            onMeasureAdd={(p) => setMeasure((m) => [...m, p])}
            ghost={compare?.geometry ?? null}
            onCursor={publishCursor}
            fit={fit}
            center={enterprisePoint}
            elements={elementMarkers}
            selectedElementId={elementForm ? selectedElementId ?? DRAFT_ELEMENT : null}
            draggableElementId={writable && elementForm && selectedElement?.status !== 'INACTIVE' ? selectedElementId ?? DRAFT_ELEMENT : null}
            onSelectElement={(eid) => selectElement(eid)}
            onMoveElement={moveElement}
            onPlace={placeElement}
          />
          {(HINTS[mode] || inactiveEnterprise) && (
            <Paper shadow="sm" px="sm" py={6} radius="md" style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(640px, 90%)', zIndex: 2 }}>
              <Text fz="xs" ta="center">{inactiveEnterprise ? 'Empreendimento inativo: as áreas estão disponíveis apenas para consulta.' : HINTS[mode]}</Text>
            </Paper>
          )}
          {mode === 'measure' && measure.length > 1 && (
            <Paper shadow="sm" p="xs" radius="md" style={{ position: 'absolute', bottom: 36, right: 10, zIndex: 2 }}>
              <Text fz="xs" c="dimmed">Distância medida ({measure.length - 1} segmento{measure.length > 2 ? 's' : ''})</Text>
              <Text fw={700} ff="monospace">{formatMeters(measureLength)}</Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setMeasure([])}>Limpar</Button>
            </Paper>
          )}
        </Box>

        {/* Painel lateral */}
        <Box w={narrow ? '100%' : 420} style={{ borderLeft: narrow ? undefined : '1px solid var(--mantine-color-gray-3)', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: narrow ? '50vh' : undefined }}>
          <Tabs value={tab} onChange={setTab} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <Tabs.List grow>
              <Tabs.Tab value="layers">Camadas ({listed.length})</Tabs.Tab>
              <Tabs.Tab value="area">{elementForm ? 'Elemento' : editing && !draft?.areaId ? 'Nova área' : 'Área'}</Tabs.Tab>
              <Tabs.Tab value="history" disabled={!selected || !!elementForm}>Histórico</Tabs.Tab>
            </Tabs.List>
            <ScrollArea style={{ flex: 1 }} p="md">
              <Tabs.Panel value="layers">
                <LayersPanel
                  elements={listedElements}
                  hiddenElementTypes={hiddenElementTypes}
                  onToggleElementType={(t) => setHiddenElementTypes((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
                  selectedElementId={selectedElementId}
                  onSelectElement={(eid) => selectElement(eid, true)}
                  areas={listed}
                  hiddenTypes={hiddenTypes}
                  onToggleType={(t) => setHiddenTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
                  selectedId={selectedId}
                  onSelect={(aid) => selectArea(aid, true)}
                  showArchived={showArchived}
                  onShowArchived={setShowArchived}
                />
              </Tabs.Panel>
              <Tabs.Panel value="area">
                {elementForm ? (
                  <ElementPanel
                    element={selectedElement}
                    form={elementForm}
                    onChange={setElementForm}
                    types={elementTypes}
                    crs={crs}
                    canWrite={writable}
                    saving={saveElement.isPending}
                    onSave={() => saveElement.mutate()}
                    onCancel={closeElement}
                    onArchive={(a) => archiveElement.mutate(a)}
                  />
                ) : (
                <AreaPanel
                  area={editing && !draft?.areaId ? null : selected}
                  isNew={editing && !draft?.areaId}
                  editing={editing}
                  dirty={dirty}
                  ring={ring}
                  closed={closed}
                  crs={crs}
                  types={types}
                  newArea={newArea}
                  onNewAreaChange={setNewArea}
                  versionNotes={versionNotes}
                  onVersionNotes={setVersionNotes}
                  canWrite={writable}
                  canValidate={canValidate}
                  saving={save.isPending}
                  onStartEdit={() => startEdit()}
                  onCancel={() => guard(stopEditing)}
                  onSave={() => save.mutate()}
                  onUpdateProps={(body) => selected && patch.mutate({ areaId: selected.id, body })}
                  onValidate={confirmValidate}
                  onArchive={(arch) => selected && archive.mutate({ areaId: selected.id, archive: arch })}
                  onPaste={() => setPasteFor('replace')}
                  selectedVertex={selectedVertex}
                  onSelectVertex={setSelectedVertex}
                  onMoveVertex={moveVertex}
                  onInsertAfter={insertAfter}
                  onRemoveVertex={removeVertex}
                />
                )}
              </Tabs.Panel>
              <Tabs.Panel value="history">
                {selected && (
                  <VersionsPanel
                    area={selected}
                    compareId={compare?.id ?? null}
                    onCompare={setCompare}
                    canValidate={canValidate}
                    canWrite={writable}
                    busy={validate.isPending}
                    onValidate={confirmValidate}
                    onRestore={(v) => guard(() => startEdit(v))}
                  />
                )}
              </Tabs.Panel>
            </ScrollArea>
          </Tabs>
        </Box>
      </Box>

      {/* Rodapé: coordenadas do cursor e status */}
      <Group px="sm" py={4} gap="lg" justify="space-between" wrap="nowrap" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }} fz="xs">
        <Group gap="sm" wrap="nowrap">
          <CrsSelect value={crs} onChange={setCrs} />
          <CursorReadout crs={crs} listeners={cursorListeners.current} />
        </Group>
        <Text fz="xs" c="dimmed">
          {editing ? (dirty ? 'Alterações não salvas' : 'Editando') : `${listed.filter((a) => a.status === 'ACTIVE').length} área(s)`} · {crs.kind === 'utm' ? `UTM ${crs.zone}${crs.hemisphere}` : 'SIRGAS 2000'}
        </Text>
      </Group>

      <ImportModal opened={importOpen} onClose={() => setImportOpen(false)} types={types} defaultZone={zone} onImport={runImport} />
      <PasteCoordinatesModal
        opened={!!pasteFor}
        onClose={() => setPasteFor(null)}
        crs={crs}
        title={pasteFor === 'new' ? 'Nova área por coordenadas' : 'Substituir vértices por coordenadas'}
        onApply={applyPaste}
      />
    </Box>
  );
}

/** Rodapé com a coordenada do cursor no sistema escolhido. */
function CursorReadout({ crs, listeners }: { crs: Crs; listeners: Set<(p: LngLat | null) => void> }) {
  const [cursor, setCursor] = useState<LngLat | null>(null);
  useEffect(() => {
    listeners.add(setCursor);
    return () => { listeners.delete(setCursor); };
  }, [listeners]);
  const [ax, bx] = axisLabels(crs);
  const text = cursor ? formatPair(cursor, crs) : null;
  return (
    <Text fz="xs" ff="monospace" c={text ? undefined : 'dimmed'}>
      {text ? `${ax}: ${text[0]}   ${bx}: ${text[1]}` : 'Passe o mouse sobre o mapa para ver as coordenadas'}
    </Text>
  );
}
