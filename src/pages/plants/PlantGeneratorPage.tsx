import {
  Alert, Badge, Box, Button, Card, Checkbox, Grid, Group, Loader, MultiSelect, Radio, SegmentedControl, Select, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEye, IconFileCheck } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Area, Enterprise, MapElement, Member, Paginated, PlantKind, PlantRecord, PlantSnapshotArea, PlantSnapshotElement } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { LoadingBlock, PageHeader } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { epsgOf, suggestedUtm } from '../../lib/crs';
import { centroid, formatHa, type LngLat } from '../../lib/geodesy';
import { buildPlantPdf, type PlantSpec } from '../../plants/buildPlantPdf';
import { autoLayout, fittingScale, SHEET_SIZES, STANDARD_SCALES, type SheetSize } from '../../plants/layout';
import { plantFileName, savePdf, specFromRecord } from '../../plants/spec';
import { SymbolIcon } from '../editor/ElementPanel';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rev = (r: number) => `R${String(r).padStart(2, '0')}`;
const TITLES: Record<PlantKind, string> = { LOCATION: 'Planta de localização', DELIMITATION: 'Planta de delimitação' };

const toSnapshotArea = (a: Area, vertexTable: boolean): PlantSnapshotArea => ({
  areaId: a.id, versionId: a.currentVersion.id, version: a.currentVersion.version, validated: !!a.currentVersion.validatedAt,
  name: a.name, typeName: a.areaType.name, color: a.areaType.color, sortOrder: 0, areaM2: a.currentVersion.areaM2,
  perimeterM: a.currentVersion.perimeterM, vertexCount: a.currentVersion.vertexCount, vertexTable, geometry: a.currentVersion.geometry,
});

/** Geração de planta de localização ou de delimitação (Épico 07): opções, prévia em PDF e emissão de revisão. */
export function PlantGeneratorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me, can } = useAuth();

  const enterpriseQ = useQuery({ queryKey: ['enterprise', id], queryFn: () => api.get<Enterprise>(`/enterprises/${id}`) });
  const currentQ = useQuery({ queryKey: ['areas', id, 'plant-current'], queryFn: () => api.get<Area[]>(`/enterprises/${id}/areas`) });
  const validatedQ = useQuery({ queryKey: ['areas', id, 'plant-validated'], queryFn: () => api.get<Area[]>(`/enterprises/${id}/areas`, { source: 'validated' }) });
  const elementsQ = useQuery({ queryKey: ['elements', id, 'active'], queryFn: () => api.get<MapElement[]>(`/enterprises/${id}/elements`) });
  const teamQ = useQuery({ queryKey: ['users', 'team'], queryFn: () => api.get<Paginated<Member>>('/users', { status: 'ACTIVE', pageSize: 100 }), enabled: can('users.read') });
  const nextQ = useQuery({ queryKey: ['plants', id, 'next'], queryFn: () => api.get<Record<PlantKind, number>>(`/enterprises/${id}/plants/next-revisions`) });

  const [kind, setKind] = useState<PlantKind>(params.get('tipo') === 'localizacao' ? 'LOCATION' : 'DELIMITATION');
  const [source, setSource] = useState<'validated' | 'current' | null>(null);
  const [areaIds, setAreaIds] = useState<Set<string>>(new Set());
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [elementTypeIds, setElementTypeIds] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'auto' | SheetSize>('auto');
  const [scale, setScale] = useState<'auto' | number>('auto');
  const [basemap, setBasemap] = useState<'satellite' | 'streets'>(kind === 'LOCATION' ? 'streets' : 'satellite');
  const [responsible, setResponsible] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(today());
  const [title, setTitle] = useState(TITLES[kind]);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [preview, setPreview] = useState<{ url: string; key: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const initialized = useRef(false);

  const currentAreas = currentQ.data ?? [];
  const validatedAreas = validatedQ.data ?? [];
  const sourceAreas = source === 'validated' ? validatedAreas : currentAreas;
  const elements = elementsQ.data ?? [];
  const elementTypes = useMemo(() => {
    const map = new Map<string, MapElement['elementType'] & { count: number }>();
    elements.forEach((e) => map.set(e.elementTypeId, { ...e.elementType, count: (map.get(e.elementTypeId)?.count ?? 0) + 1 }));
    return [...map.values()];
  }, [elements]);

  // Padrões ao carregar: versão validada se houver, todas as áreas, quadro de vértices da primeira camada, RT = responsável do empreendimento
  useEffect(() => {
    if (initialized.current || !currentQ.data || !validatedQ.data || !elementsQ.data || !enterpriseQ.data) return;
    initialized.current = true;
    const src = validatedQ.data.length ? 'validated' : 'current';
    setSource(src);
    const list = src === 'validated' ? validatedQ.data : currentQ.data;
    setAreaIds(new Set(list.map((a) => a.id)));
    setTableIds(list.length ? list.filter((a) => a.areaType.id === list[0].areaType.id).map((a) => a.id) : []);
    if (kind === 'DELIMITATION') setElementTypeIds(new Set(elementsQ.data.map((e) => e.elementTypeId)));
    setResponsible(enterpriseQ.data.responsibleUserId ?? me?.user.id ?? null);
  }, [currentQ.data, validatedQ.data, elementsQ.data, enterpriseQ.data, kind, me]);

  useEffect(() => {
    if (nextQ.data) setRevisionNotes((n) => n || (nextQ.data[kind] === 0 ? 'Emissão inicial' : ''));
  }, [nextQ.data, kind]);

  const changeKind = (k: PlantKind) => {
    setKind(k);
    setTitle(TITLES[k]);
    setBasemap(k === 'LOCATION' ? 'streets' : 'satellite');
    setElementTypeIds(k === 'LOCATION' ? new Set() : new Set(elements.map((e) => e.elementTypeId)));
    setSheet('auto');
    setScale('auto');
    setRevisionNotes('');
  };

  const changeSource = (s: 'validated' | 'current') => {
    setSource(s);
    const ids = new Set((s === 'validated' ? validatedAreas : currentAreas).map((a) => a.id));
    setAreaIds((prev) => new Set([...prev].filter((x) => ids.has(x))));
    setTableIds((prev) => prev.filter((x) => ids.has(x)));
  };

  // ── Especificação (prévia) ──
  const enterprise = enterpriseQ.data;
  const team = (teamQ.data?.items ?? []).filter((m) => m.role !== 'CLIENT');
  const responsibleName = team.find((m) => m.id === responsible)?.name ?? (responsible === me?.user.id ? me?.user.name : undefined);
  const chosenAreas = sourceAreas.filter((a) => areaIds.has(a.id));
  const chosenElements = elements.filter((e) => elementTypeIds.has(e.elementTypeId));
  const enterprisePoint: LngLat | null = enterprise?.longitude != null && enterprise.latitude != null ? [enterprise.longitude, enterprise.latitude] : null;

  const layout = useMemo(() => {
    const pts: LngLat[] = chosenAreas.flatMap((a) => a.currentVersion.geometry.coordinates[0] as LngLat[]);
    if (kind === 'LOCATION' && enterprisePoint) pts.push(enterprisePoint);
    if (kind === 'DELIMITATION') chosenElements.forEach((e) => pts.push([e.longitude, e.latitude]));
    const auto = autoLayout(kind, pts);
    if (!auto) return null;
    const sheetSize = sheet === 'auto' ? auto.sheet : sheet;
    const scaleDenominator = scale !== 'auto' ? scale : sheet === 'auto' ? auto.scaleDenominator : fittingScale(sheetSize, auto.widthM, auto.heightM);
    const center = kind === 'LOCATION' && enterprisePoint ? enterprisePoint : auto.center;
    const utm = suggestedUtm(centroid(pts));
    return { sheetSize, scaleDenominator, center, zone: utm.zone!, hemisphere: utm.hemisphere!, epsg: epsgOf(utm), auto };
  }, [chosenAreas, chosenElements, kind, sheet, scale, enterprisePoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const revision = nextQ.data?.[kind] ?? 0;
  const ready = !!enterprise && !!layout && !!responsibleName && (kind === 'LOCATION' ? !!enterprisePoint || chosenAreas.length > 0 : chosenAreas.length > 0);

  const buildSpec = (draft: boolean): PlantSpec => ({
    kind, title: title.trim() || TITLES[kind], revision, revisionNotes: revisionNotes.trim() || null, issueDate,
    responsibleName: responsibleName ?? '', sheetSize: layout!.sheetSize, scaleDenominator: layout!.scaleDenominator,
    zone: layout!.zone, hemisphere: layout!.hemisphere, epsg: layout!.epsg, basemap, center: layout!.center,
    organizationName: me?.organization.name ?? '',
    enterprise: {
      name: enterprise!.name, code: enterprise!.code, street: enterprise!.street ?? null, number: enterprise!.number ?? null, district: enterprise!.district ?? null,
      city: enterprise!.city ?? null, state: enterprise!.state ?? null, carNumber: enterprise!.carNumber, propertyRegistration: enterprise!.propertyRegistration,
      latitude: enterprise!.latitude, longitude: enterprise!.longitude,
    },
    client: { name: enterprise!.client.name, tradeName: enterprise!.client.tradeName, document: enterprise!.client.document },
    versionSource: source ?? 'current',
    areas: chosenAreas.map((a, i) => ({ ...toSnapshotArea(a, kind === 'DELIMITATION' && tableIds.includes(a.id)), sortOrder: i })),
    elements: chosenElements.map((e): PlantSnapshotElement => ({
      id: e.id, name: e.name, specification: e.specification, latitude: e.latitude, longitude: e.longitude, typeId: e.elementTypeId,
      typeName: e.elementType.name, shape: e.elementType.shape, code: e.elementType.code, color: e.elementType.color, sortOrder: 0,
    })),
    draft,
  });

  const specKey = ready ? JSON.stringify({ ...buildSpec(true), revisionNotes: null }) : '';
  const stale = !!preview && preview.key !== specKey;

  const generatePreview = async () => {
    setProgress('Preparando…');
    try {
      const bytes = await buildPlantPdf(buildSpec(true), setProgress);
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), key: specKey });
    } catch (e) {
      notifyError(e, (e as Error).message);
    }
    setProgress(null);
  };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const issue = useMutation({
    mutationFn: async () => {
      const record = await api.post<PlantRecord>(`/enterprises/${id}/plants`, {
        kind, title: title.trim() || undefined, revisionNotes: revisionNotes.trim() || undefined, issueDate, responsibleUserId: responsible,
        sheetSize: layout!.sheetSize, scaleDenominator: layout!.scaleDenominator, crsEpsg: layout!.epsg, versionSource: source,
        areaIds: chosenAreas.map((a) => a.id), vertexTableAreaIds: kind === 'DELIMITATION' ? tableIds.filter((t) => areaIds.has(t)) : [],
        elementIds: chosenElements.map((e) => e.id),
        layout: { basemap, center: layout!.center, zone: layout!.zone, hemisphere: layout!.hemisphere },
      });
      setProgress('Gerando o PDF da revisão emitida…');
      const spec = specFromRecord(record);
      savePdf(await buildPlantPdf(spec, setProgress), plantFileName(spec));
      return record;
    },
    onSuccess: (r) => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ['plants', id] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      notifySuccess(`${r.title} ${rev(r.revision)} emitida`);
      navigate(`/empreendimentos/${id}?aba=plantas`);
    },
    onError: (e) => { setProgress(null); notifyError(e, (e as Error).message); },
  });

  const confirmIssue = () =>
    modals.openConfirmModal({
      title: `Emitir ${title} ${rev(revision)}`,
      children: (
        <Text fz="sm">
          A revisão <b>{rev(revision)}</b> será registrada com responsável técnico <b>{responsibleName}</b> e data {issueDate.split('-').reverse().join('/')}.
          Depois de emitida ela não pode ser alterada; ajustes geram uma nova revisão.
        </Text>
      ),
      labels: { confirm: 'Emitir e baixar PDF', cancel: 'Cancelar' },
      onConfirm: () => issue.mutate(),
    });

  if (enterpriseQ.isLoading || currentQ.isLoading || validatedQ.isLoading || elementsQ.isLoading || !source) return <LoadingBlock />;
  if (!enterprise) return null;

  const teamOptions = team.length ? team.map((m) => ({ value: m.id, label: m.name })) : me ? [{ value: me.user.id, label: me.user.name }] : [];
  const unvalidatedCount = currentAreas.length - validatedAreas.length;

  return (
    <>
      <PageHeader
        title={`Nova ${TITLES[kind].toLowerCase()}`}
        breadcrumbs={[{ label: 'Empreendimentos', to: '/empreendimentos' }, { label: enterprise.name, to: `/empreendimentos/${id}?aba=plantas` }, { label: 'Nova planta' }]}
      />
      <Grid>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack>
            <Card withBorder padding="md">
              <Stack gap="sm">
                <SegmentedControl fullWidth value={kind} onChange={(v) => changeKind(v as PlantKind)} data={[{ value: 'DELIMITATION', label: 'Delimitação' }, { value: 'LOCATION', label: 'Localização' }]} />
                <TextInput label="Título" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
              </Stack>
            </Card>

            <Card withBorder padding="md">
              <Title order={6} mb="xs">Áreas</Title>
              <Radio.Group value={source} onChange={(v) => changeSource(v as 'validated' | 'current')}>
                <Stack gap={4} mb="sm">
                  <Radio value="validated" label={`Última versão validada (${validatedAreas.length} área(s))`} disabled={!validatedAreas.length} />
                  <Radio value="current" label="Versão atual (inclui não validadas)" />
                </Stack>
              </Radio.Group>
              {source === 'validated' && unvalidatedCount > 0 && (
                <Alert variant="light" color="yellow" p="xs" mb="sm" fz="xs">{unvalidatedCount} área(s) sem versão validada ficam de fora. Valide-as no editor ou use a versão atual.</Alert>
              )}
              {source === 'current' && sourceAreas.some((a) => !a.currentVersion.validatedAt) && (
                <Alert variant="light" color="yellow" p="xs" mb="sm" fz="xs">Áreas não validadas serão marcadas com * na planta.</Alert>
              )}
              <Stack gap={4}>
                {sourceAreas.length === 0 && <Text fz="sm" c="dimmed">Nenhuma área disponível.</Text>}
                {sourceAreas.map((a) => (
                  <Checkbox
                    key={a.id}
                    checked={areaIds.has(a.id)}
                    onChange={(e) => { const checked = e.currentTarget.checked; setAreaIds((s) => { const n = new Set(s); if (checked) n.add(a.id); else n.delete(a.id); return n; }); }}
                    label={
                      <Group gap={6} wrap="nowrap">
                        <span className="area-swatch" style={{ background: a.areaType.color }} />
                        <Text fz="sm" lineClamp={1}>{a.name}</Text>
                        <Badge size="xs" variant="light" color={a.currentVersion.validatedAt ? 'forest' : 'gray'}>V{a.currentVersion.version}</Badge>
                        <Text fz="xs" c="dimmed">{formatHa(a.currentVersion.areaM2)}</Text>
                      </Group>
                    }
                  />
                ))}
              </Stack>
              {kind === 'DELIMITATION' && (
                <MultiSelect
                  mt="sm"
                  label="Quadro de vértices"
                  description="Áreas com vértices numerados e tabela de coordenadas"
                  data={chosenAreas.map((a) => ({ value: a.id, label: a.name }))}
                  value={tableIds.filter((t) => areaIds.has(t))}
                  onChange={setTableIds}
                  clearable
                />
              )}
            </Card>

            <Card withBorder padding="md">
              <Title order={6} mb="xs">Elementos pontuais</Title>
              {!elementTypes.length && <Text fz="sm" c="dimmed">Nenhum elemento cadastrado no editor.</Text>}
              <Stack gap={4}>
                {elementTypes.map((t) => (
                  <Checkbox
                    key={t.id}
                    checked={elementTypeIds.has(t.id)}
                    onChange={(e) => { const checked = e.currentTarget.checked; setElementTypeIds((s) => { const n = new Set(s); if (checked) n.add(t.id); else n.delete(t.id); return n; }); }}
                    label={<Group gap={6} wrap="nowrap"><SymbolIcon type={t} size={16} /><Text fz="sm">{t.name}</Text><Text fz="xs" c="dimmed">({t.count})</Text></Group>}
                  />
                ))}
              </Stack>
            </Card>

            <Card withBorder padding="md">
              <Title order={6} mb="xs">Folha e mapa</Title>
              <Group grow>
                <Select label="Folha" value={sheet} allowDeselect={false} onChange={(v) => { setSheet((v ?? 'auto') as 'auto' | SheetSize); setScale('auto'); }}
                  data={[{ value: 'auto', label: `Automática${layout ? ` (${layout.auto.sheet})` : ''}` }, ...SHEET_SIZES.map((s) => ({ value: s, label: s }))]} />
                <Select label="Escala" value={String(scale)} allowDeselect={false} onChange={(v) => setScale(!v || v === 'auto' ? 'auto' : Number(v))}
                  data={[{ value: 'auto', label: `Automática${layout ? ` (1:${layout.scaleDenominator.toLocaleString('pt-BR')})` : ''}` }, ...STANDARD_SCALES.map((s) => ({ value: String(s), label: `1:${s.toLocaleString('pt-BR')}` }))]} />
              </Group>
              <SegmentedControl mt="sm" fullWidth size="xs" value={basemap} onChange={(v) => setBasemap(v as 'satellite' | 'streets')} data={[{ value: 'satellite', label: 'Fundo: satélite' }, { value: 'streets', label: 'Fundo: mapa' }]} />
              {layout && <Text fz="xs" c="dimmed" mt="xs">SIRGAS 2000 / UTM {layout.zone}{layout.hemisphere} (EPSG:{layout.epsg}) · folha e escala automáticas pela dimensão do projeto</Text>}
            </Card>

            <Card withBorder padding="md">
              <Title order={6} mb="xs">Carimbo</Title>
              <Stack gap="xs">
                <Select label="Responsável técnico" withAsterisk data={teamOptions} value={responsible} onChange={setResponsible} searchable />
                <Group grow>
                  <TextInput label="Data" type="date" withAsterisk value={issueDate} onChange={(e) => setIssueDate(e.currentTarget.value)} />
                  <TextInput label="Revisão" value={rev(revision)} readOnly variant="filled" description="Sequencial automática" />
                </Group>
                <TextInput label="Descrição da revisão" placeholder="Ex.: Emissão inicial / Ajuste da APP" value={revisionNotes} onChange={(e) => setRevisionNotes(e.currentTarget.value)} />
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder padding="md" h="100%">
            <Group justify="space-between" mb="sm">
              <div>
                <Title order={5}>Prévia</Title>
                <Text fz="xs" c="dimmed">{layout ? `${layout.sheetSize} paisagem · 1:${layout.scaleDenominator.toLocaleString('pt-BR')} · ${rev(revision)}` : 'Selecione ao menos uma área'}</Text>
              </div>
              <Group gap="xs">
                <Button variant="light" leftSection={<IconEye size={16} />} onClick={generatePreview} disabled={!ready || !!progress} loading={!!progress && !issue.isPending}>
                  {preview ? 'Atualizar prévia' : 'Gerar prévia'}
                </Button>
                {can('plants.issue') && (
                  <Button leftSection={<IconFileCheck size={16} />} onClick={confirmIssue} disabled={!ready || !!progress || !issueDate} loading={issue.isPending}>
                    Emitir {rev(revision)}
                  </Button>
                )}
              </Group>
            </Group>
            {!ready && <Alert variant="light" color="yellow" mb="sm">{kind === 'DELIMITATION' ? 'Selecione ao menos uma área' : 'Informe a localização do empreendimento ou selecione uma área'} e o responsável técnico.</Alert>}
            {stale && <Alert variant="light" color="slateBlue" mb="sm" p="xs">As opções mudaram. Atualize a prévia para conferir.</Alert>}
            {progress && <Group gap="xs" mb="sm"><Loader size="xs" /><Text fz="sm">{progress}</Text></Group>}
            <Box style={{ height: '78vh', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, overflow: 'hidden', background: 'var(--mantine-color-gray-1)' }}>
              {preview ? (
                <iframe title="Prévia da planta" src={preview.url} style={{ width: '100%', height: '100%', border: 0 }} data-testid="plant-preview" />
              ) : (
                <Stack h="100%" align="center" justify="center" gap={4}>
                  <Text c="dimmed" fz="sm">Clique em “Gerar prévia” para revisar a planta antes de emitir.</Text>
                  <Text c="dimmed" fz="xs">A prévia leva alguns segundos (carrega a imagem de fundo na resolução de impressão).</Text>
                </Stack>
              )}
            </Box>
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
