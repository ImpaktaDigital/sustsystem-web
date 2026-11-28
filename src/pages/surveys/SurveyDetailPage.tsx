import {
  Alert, Anchor, Badge, Button, Card, Checkbox, Grid, Group, Image, Modal, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Textarea,
  TextInput, Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconCheck, IconLink, IconMap2, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  ENTERPRISE_TYPE_LABELS, SOURCE_METHOD_LABELS, SURVEY_STATUS_LABELS, type AreaType, type Client, type ElementType, type Enterprise,
  type EnterpriseType, type Paginated, type SurveyDetail, type SurveyFeature,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { UFS } from '../../components/AddressFields';
import { Field, LoadingBlock, PageHeader } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatHa, formatMeters } from '../../lib/geodesy';
import { formatDateTime, maskCpfCnpj } from '../../lib/masks';
import { formatDocument, isValidDocument, onlyDigits } from '../../lib/shared';
import { MapView, type MapPoint } from '../../map/MapView';
import { SymbolIcon } from '../editor/ElementPanel';
import { NotFoundPage } from '../NotFoundPage';
import { SURVEY_STATUS_COLORS } from './SurveysPage';

interface Decision { include: boolean; typeId: string | null; name: string }

/** Precisão estimada informada pelo GPS do aparelho (média e pior vértice). */
function precision(f: SurveyFeature) {
  const values = (f.vertexAccuracies ?? []).filter((v): v is number => typeof v === 'number');
  if (!values.length) return '—';
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return values.length === 1 ? `±${avg.toFixed(1)} m` : `±${avg.toFixed(1)} m (pior ±${Math.max(...values).toFixed(1)} m)`;
}

function EnterpriseSearch({ value, onChange }: { value: string | null; onChange: (id: string | null, label?: string) => void }) {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const { data } = useQuery({
    queryKey: ['enterprises', 'select', debounced],
    queryFn: () => api.get<Paginated<Enterprise>>('/enterprises', { search: debounced, status: 'ACTIVE', pageSize: 30 }),
  });
  const options = (data?.items ?? []).map((e) => ({ value: e.id, label: `${e.name} — ${e.client.tradeName || e.client.name}` }));
  return (
    <Select
      label="Empreendimento existente"
      placeholder="Buscar empreendimento"
      searchable
      data={options}
      value={value}
      onChange={(v) => onChange(v, options.find((o) => o.value === v)?.label)}
      onSearchChange={setSearch}
      filter={({ options: o }) => o}
      nothingFoundMessage="Nenhum empreendimento encontrado"
    />
  );
}

/** Cria cliente (ou usa existente) e empreendimento a partir do pré-cadastro feito em campo. */
function CreateFromPreRegistration({ survey, opened, onClose, onCreated }: { survey: SurveyDetail; opened: boolean; onClose: () => void; onCreated: (e: Enterprise) => void }) {
  const pre = survey.preRegistration ?? {};
  const [mode, setMode] = useState<'new' | 'existing'>(pre.clientId ? 'existing' : 'new');
  const [clientId, setClientId] = useState<string | null>(pre.clientId ?? null);
  const [clientSearch, setClientSearch] = useState('');
  const [debounced] = useDebouncedValue(clientSearch, 300);
  const [client, setClient] = useState({ type: pre.clientType ?? (onlyDigits(pre.clientDocument ?? '').length === 11 ? 'PF' : 'PJ'), name: pre.clientName ?? '', document: pre.clientDocument ?? '' });
  const [ent, setEnt] = useState({
    name: pre.enterpriseName ?? pre.clientName ?? survey.title, type: (pre.enterpriseType as EnterpriseType) ?? 'OTHER',
    city: pre.city ?? '', state: pre.state ?? null as string | null,
  });
  const clients = useQuery({
    queryKey: ['clients', 'select', debounced],
    queryFn: () => api.get<Paginated<Client>>('/clients', { search: debounced, status: 'ACTIVE', pageSize: 30 }),
    enabled: opened && mode === 'existing',
  });

  const save = useMutation({
    mutationFn: async () => {
      let id = clientId;
      if (mode === 'new') {
        const created = await api.post<Client>('/clients', {
          type: client.type, name: client.name.trim(), document: onlyDigits(client.document),
          phone: pre.contactPhone || undefined, email: pre.contactEmail || undefined,
          street: pre.street || undefined, number: pre.number || undefined, district: pre.district || undefined,
          city: pre.city || undefined, state: pre.state || undefined, zipCode: pre.zipCode ? onlyDigits(pre.zipCode) : undefined,
          notes: [pre.contactName && `Contato: ${pre.contactName}`, pre.projectHint && `Projeto: ${pre.projectHint}`, `Origem: levantamento de campo "${survey.title}"`].filter(Boolean).join('\n'),
        });
        id = created.id;
      }
      return api.post<Enterprise>('/enterprises', {
        clientId: id, name: ent.name.trim(), type: ent.type, city: ent.city || undefined, state: ent.state || undefined,
        street: pre.street || undefined, number: pre.number || undefined, district: pre.district || undefined,
        zipCode: pre.zipCode ? onlyDigits(pre.zipCode) : undefined,
        latitude: survey.centroidLat != null ? Math.round(survey.centroidLat * 1e7) / 1e7 : undefined,
        longitude: survey.centroidLng != null ? Math.round(survey.centroidLng * 1e7) / 1e7 : undefined,
        notes: pre.projectHint ? `Projeto: ${pre.projectHint}` : undefined,
      });
    },
    onSuccess: (e) => { notifySuccess(`Empreendimento ${e.name} cadastrado`); onCreated(e); },
    onError: (e) => notifyError(e),
  });

  const docValid = isValidDocument(client.type as 'PF' | 'PJ', client.document);
  const ready = ent.name.trim().length >= 2 && (mode === 'existing' ? !!clientId : client.name.trim().length >= 2 && docValid);
  return (
    <Modal opened={opened} onClose={onClose} title="Cadastrar a partir do pré-cadastro" size="lg">
      <Stack>
        <SegmentedControl value={mode} onChange={(v) => setMode(v as 'new' | 'existing')} data={[{ value: 'new', label: 'Novo cliente' }, { value: 'existing', label: 'Cliente já cadastrado' }]} />
        {mode === 'new' ? (
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Select label="Tipo" data={[{ value: 'PJ', label: 'Pessoa jurídica' }, { value: 'PF', label: 'Pessoa física' }]} value={client.type} onChange={(v) => v && setClient({ ...client, type: v as 'PF' | 'PJ' })} allowDeselect={false} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={client.type === 'PJ' ? 'CNPJ' : 'CPF'} withAsterisk value={maskCpfCnpj(client.document)} onChange={(e) => setClient({ ...client, document: e.currentTarget.value })}
                error={client.document && !docValid ? 'Documento inválido' : undefined} description={!pre.clientDocument ? 'Não informado em campo: obtenha com o cliente' : undefined} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label={client.type === 'PJ' ? 'Razão social' : 'Nome completo'} withAsterisk value={client.name} onChange={(e) => setClient({ ...client, name: e.currentTarget.value })} />
            </Grid.Col>
          </Grid>
        ) : (
          <Select
            label="Cliente"
            searchable
            data={(clients.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.tradeName || c.name} — ${formatDocument(c.document)}` }))}
            value={clientId}
            onChange={setClientId}
            onSearchChange={setClientSearch}
            filter={({ options }) => options}
            nothingFoundMessage="Nenhum cliente encontrado"
          />
        )}
        <Title order={6}>Empreendimento</Title>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 7 }}><TextInput label="Nome" withAsterisk value={ent.name} onChange={(e) => setEnt({ ...ent, name: e.currentTarget.value })} /></Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <Select label="Tipo" data={Object.entries(ENTERPRISE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} value={ent.type} onChange={(v) => v && setEnt({ ...ent, type: v as EnterpriseType })} allowDeselect={false} />
          </Grid.Col>
          <Grid.Col span={{ base: 8 }}><TextInput label="Município" value={ent.city} onChange={(e) => setEnt({ ...ent, city: e.currentTarget.value })} /></Grid.Col>
          <Grid.Col span={{ base: 4 }}><Select label="UF" data={UFS} searchable value={ent.state} onChange={(v) => setEnt({ ...ent, state: v })} /></Grid.Col>
        </Grid>
        <Text fz="xs" c="dimmed">A localização do empreendimento será o centro do levantamento. Os demais dados podem ser completados depois no cadastro.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!ready}>Cadastrar e vincular</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Triagem de um levantamento de campo: conferência, vínculo, escolha dos itens e aprovação (Parte 5). */
export function SurveyDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const review = can('surveys.review');
  const { data: survey, isLoading, error } = useQuery({ queryKey: ['survey', id], queryFn: () => api.get<SurveyDetail>(`/surveys/${id}`) });
  const areaTypes = useQuery({ queryKey: ['area-types'], queryFn: () => api.get<AreaType[]>('/area-types') });
  const elementTypes = useQuery({ queryKey: ['element-types'], queryFn: () => api.get<ElementType[]>('/element-types') });
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [photo, setPhoto] = useState<SurveyDetail['photos'][number] | null>(null);

  useEffect(() => {
    if (!survey) return;
    setDecisions(Object.fromEntries(survey.features.map((f) => [f.id, { include: f.status !== 'DISCARDED', typeId: f.suggestedTypeId, name: f.name }])));
    setTargetId(survey.enterprise?.id ?? null);
    setTargetLabel(survey.enterprise?.name ?? null);
  }, [survey]);

  const typeColor = (f: SurveyFeature) => areaTypes.data?.find((t) => t.id === decisions[f.id]?.typeId)?.color ?? '#f97316';
  const polygons = useMemo(() => (survey?.features ?? []).filter((f) => f.kind === 'AREA').map((f) => ({
    id: f.id, geometry: f.geometry as { type: 'Polygon'; coordinates: number[][][] }, color: typeColor(f),
  })), [survey, decisions, areaTypes.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const points = useMemo<MapPoint[]>(() => (survey?.features ?? []).filter((f) => f.kind === 'ELEMENT').map((f) => ({
    id: f.id, longitude: (f.geometry.coordinates as number[])[0], latitude: (f.geometry.coordinates as number[])[1], title: f.name, subtitle: f.specification ?? undefined,
  })), [survey]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['survey', id] });
    queryClient.invalidateQueries({ queryKey: ['surveys'] });
    queryClient.invalidateQueries({ queryKey: ['surveys-pending'] });
  };

  const approve = useMutation({
    mutationFn: () => api.post<SurveyDetail>(`/surveys/${id}/approve`, {
      enterpriseId: targetId ?? undefined,
      reviewNotes: reviewNotes.trim() || undefined,
      features: survey!.features.map((f) => ({ id: f.id, include: !!decisions[f.id]?.include, typeId: decisions[f.id]?.typeId ?? undefined, name: decisions[f.id]?.name?.trim() || undefined })),
    }),
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ['areas'] }); notifySuccess('Levantamento aprovado: áreas e elementos criados no empreendimento'); },
    onError: (e) => notifyError(e),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => api.post(`/surveys/${id}/reject`, { reason }),
    onSuccess: () => { refresh(); notifySuccess('Levantamento rejeitado'); },
    onError: (e) => notifyError(e),
  });

  const link = useMutation({
    mutationFn: (enterpriseId: string) => api.patch<SurveyDetail>(`/surveys/${id}/link`, { enterpriseId }),
    onSuccess: () => { refresh(); notifySuccess('Levantamento vinculado ao empreendimento'); },
    onError: (e) => notifyError(e),
  });

  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => api.delete(`/surveys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys'] });
      queryClient.invalidateQueries({ queryKey: ['surveys-pending'] });
      notifySuccess('Levantamento excluído');
      navigate('/levantamentos');
    },
    onError: (e) => notifyError(e),
  });
  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Excluir levantamento',
      children: <Text fz="sm">O levantamento <b>{survey?.title}</b>, seus itens e fotos serão excluídos definitivamente.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(),
    });

  const confirmReject = () => {
    let reason = '';
    modals.openConfirmModal({
      title: 'Rejeitar levantamento',
      children: <Textarea label="Motivo" autosize minRows={2} data-autofocus onChange={(e) => (reason = e.currentTarget.value)} />,
      labels: { confirm: 'Rejeitar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => (reason.trim().length >= 3 ? reject.mutate(reason.trim()) : notifyError(null, 'Informe o motivo')),
    });
  };

  if (isLoading) return <LoadingBlock />;
  if (error || !survey) return <NotFoundPage />;
  const pending = survey.status === 'RECEIVED';
  const pre = survey.preRegistration;
  const included = survey.features.filter((f) => decisions[f.id]?.include);
  const missingType = included.some((f) => !decisions[f.id]?.typeId);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Levantamentos', to: '/levantamentos' }, { label: survey.title }]}
        title={<Group gap="sm">{survey.title}<Badge variant="light" color={SURVEY_STATUS_COLORS[survey.status]}>{SURVEY_STATUS_LABELS[survey.status]}</Badge></Group>}
        description={`Coletado por ${survey.collectedBy?.name ?? '—'} em ${formatDateTime(survey.startedAt)} · recebido em ${formatDateTime(survey.receivedAt)}`}
      />
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack>
            <Card withBorder padding="sm">
              <MapView height={420} initialBasemap="satellite" polygons={polygons} points={points} />
            </Card>

            <Card withBorder padding={0}>
              <Text fw={600} p="md" pb={0}>Itens levantados</Text>
              <Table.ScrollContainer minWidth={760}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>{pending && review && <Table.Th w={40} />}<Table.Th>Nome</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Medidas</Table.Th><Table.Th>Método / precisão</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {survey.features.map((f) => {
                      const d = decisions[f.id] ?? { include: true, typeId: f.suggestedTypeId, name: f.name };
                      const types = f.kind === 'AREA' ? areaTypes.data ?? [] : elementTypes.data ?? [];
                      const editable = pending && review;
                      return (
                        <Table.Tr key={f.id} opacity={d.include ? 1 : 0.5}>
                          {editable && <Table.Td><Checkbox aria-label={`Incluir ${f.name}`} checked={d.include} onChange={(e) => setDecisions({ ...decisions, [f.id]: { ...d, include: e.currentTarget.checked } })} /></Table.Td>}
                          <Table.Td>
                            {editable ? <TextInput size="xs" aria-label="Nome do item" value={d.name} onChange={(e) => setDecisions({ ...decisions, [f.id]: { ...d, name: e.currentTarget.value } })} /> : <Text fz="sm" fw={600}>{f.name}</Text>}
                            {f.specification && <Text fz="xs" c="dimmed">{f.specification}</Text>}
                            {f.status !== 'PENDING' && <Badge size="xs" variant="light" color={f.status === 'APPROVED' ? 'forest' : 'gray'}>{f.status === 'APPROVED' ? 'Aprovado' : 'Descartado'}</Badge>}
                          </Table.Td>
                          <Table.Td>
                            {editable ? (
                              <Select size="xs" aria-label={`Tipo de ${f.name}`} searchable data={types.map((t) => ({ value: t.id, label: t.name }))} value={d.typeId}
                                onChange={(v) => setDecisions({ ...decisions, [f.id]: { ...d, typeId: v } })} error={d.include && !d.typeId}
                                renderOption={({ option }) => {
                                  const et = f.kind === 'ELEMENT' ? elementTypes.data?.find((t) => t.id === option.value) : undefined;
                                  return <Group gap={6} wrap="nowrap">{et && <SymbolIcon type={et} size={16} />}<Text fz="sm">{option.label}</Text></Group>;
                                }} />
                            ) : <Text fz="sm">{types.find((t) => t.id === d.typeId)?.name ?? '—'}</Text>}
                          </Table.Td>
                          <Table.Td>
                            {f.kind === 'AREA' ? (
                              <>
                                <Text fz="sm" ff="monospace">{f.areaM2 != null ? formatHa(f.areaM2) : '—'}</Text>
                                <Text fz="xs" c="dimmed" ff="monospace">{f.perimeterM != null ? formatMeters(f.perimeterM) : ''} · {(f.geometry.coordinates as number[][][])[0].length - 1} vértices</Text>
                              </>
                            ) : <Text fz="xs" c="dimmed" ff="monospace">{(f.geometry.coordinates as number[]).slice(0, 2).reverse().map((v) => v.toFixed(6)).join(', ')}</Text>}
                          </Table.Td>
                          <Table.Td>
                            <Text fz="sm">{SOURCE_METHOD_LABELS[f.method]}</Text>
                            <Text fz="xs" c="dimmed">{precision(f)}</Text>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>

            {survey.photos.length > 0 && (
              <Card withBorder padding="md">
                <Text fw={600} mb="sm">Fotos ({survey.photos.length})</Text>
                <SimpleGrid cols={{ base: 2, sm: 4 }}>
                  {survey.photos.map((p) => (
                    <div key={p.id} style={{ cursor: p.url ? 'pointer' : undefined }} onClick={() => p.url && setPhoto(p)}>
                      {p.url ? <Image src={p.url} radius="sm" h={110} fit="cover" alt={p.caption ?? 'Foto do levantamento'} /> : <Card withBorder h={110}><Text fz="xs" c="dimmed">Envio pendente</Text></Card>}
                      <Text fz="xs" lineClamp={1}>{p.caption ?? survey.features.find((f) => f.id === p.featureId)?.name ?? '—'}</Text>
                    </div>
                  ))}
                </SimpleGrid>
              </Card>
            )}
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack>
            <Card withBorder padding="md">
              <Title order={6} mb="xs">Pré-cadastro feito em campo</Title>
              {pre ? (
                <Stack gap="xs">
                  <Field label="Cliente">{[pre.clientName, pre.clientDocument && formatDocument(onlyDigits(pre.clientDocument))].filter(Boolean).join(' — ')}</Field>
                  <Field label="Contato">{[pre.contactName, pre.contactPhone, pre.contactEmail].filter(Boolean).join(' · ')}</Field>
                  <Field label="Empreendimento">{pre.enterpriseName}</Field>
                  <Field label="Endereço">{[[pre.street, pre.number].filter(Boolean).join(', '), pre.district, [pre.city, pre.state].filter(Boolean).join('/')].filter(Boolean).join(' — ')}</Field>
                  <Field label="Projeto a relacionar">{pre.projectHint}</Field>
                </Stack>
              ) : <Text fz="sm" c="dimmed">Sem pré-cadastro (levantamento feito em empreendimento já cadastrado).</Text>}
              {survey.notes && <Text fz="sm" mt="sm" style={{ whiteSpace: 'pre-wrap' }}>{survey.notes}</Text>}
            </Card>

            <Card withBorder padding="md">
              <Title order={6} mb="xs">Vínculo e aprovação</Title>
              {survey.enterprise && (
                <Text fz="sm" mb="xs">Vinculado a <Anchor component={Link} to={`/empreendimentos/${survey.enterprise.id}`}>{survey.enterprise.name}</Anchor></Text>
              )}
              {pending && review ? (
                <Stack gap="sm">
                  <EnterpriseSearch value={targetId} onChange={(v, label) => { setTargetId(v); setTargetLabel(label ?? null); }} />
                  <Group gap="xs">
                    {targetId && targetId !== survey.enterprise?.id && (
                      <Button size="xs" variant="light" leftSection={<IconLink size={14} />} loading={link.isPending} onClick={() => link.mutate(targetId)}>Vincular</Button>
                    )}
                    {can('clients.write', 'enterprises.write') && (
                      <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>Cadastrar a partir do pré-cadastro</Button>
                    )}
                  </Group>
                  <Textarea label="Observações da triagem" autosize minRows={2} value={reviewNotes} onChange={(e) => setReviewNotes(e.currentTarget.value)} />
                  {!targetId && <Alert variant="light" color="yellow" p="xs" fz="xs">Escolha ou cadastre o empreendimento para aprovar.</Alert>}
                  {missingType && <Alert variant="light" color="yellow" p="xs" fz="xs">Defina o tipo de todos os itens incluídos.</Alert>}
                  <Group grow>
                    <Button color="red" variant="light" leftSection={<IconX size={16} />} onClick={confirmReject} loading={reject.isPending}>Rejeitar</Button>
                    <Button leftSection={<IconCheck size={16} />} disabled={!targetId || !included.length || missingType} loading={approve.isPending}
                      onClick={() => modals.openConfirmModal({
                        title: 'Aprovar levantamento',
                        children: <Text fz="sm">{included.length} item(ns) serão criados em <b>{targetLabel}</b> (áreas como V1, método GPS). Depois é possível ajustar no editor e validar.</Text>,
                        labels: { confirm: 'Aprovar', cancel: 'Cancelar' },
                        onConfirm: () => approve.mutate(),
                      })}>
                      Aprovar
                    </Button>
                  </Group>
                  <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={confirmDelete} loading={remove.isPending}>Excluir levantamento</Button>
                </Stack>
              ) : (
                <Stack gap="xs">
                  {survey.reviewedBy && <Text fz="sm">{SURVEY_STATUS_LABELS[survey.status]} por {survey.reviewedBy.name} em {formatDateTime(survey.reviewedAt)}</Text>}
                  {survey.reviewNotes && <Text fz="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{survey.reviewNotes}</Text>}
                  {survey.status === 'REJECTED' && review && (
                    <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete} loading={remove.isPending}>Excluir levantamento</Button>
                  )}
                  {survey.status === 'APPROVED' && survey.enterprise && (
                    <Button component={Link} to={`/empreendimentos/${survey.enterprise.id}/editor`} variant="light" leftSection={<IconMap2 size={16} />}>Abrir no editor geográfico</Button>
                  )}
                </Stack>
              )}
            </Card>

            {survey.deviceInfo && (
              <Card withBorder padding="md">
                <Title order={6} mb="xs">Aparelho</Title>
                <Text fz="xs" c="dimmed">{Object.entries(survey.deviceInfo).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</Text>
              </Card>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      <CreateFromPreRegistration
        survey={survey}
        opened={creating}
        onClose={() => setCreating(false)}
        onCreated={(e) => { setCreating(false); setTargetId(e.id); setTargetLabel(e.name); link.mutate(e.id); }}
      />
      <Modal opened={!!photo} onClose={() => setPhoto(null)} size="xl" title={photo?.caption ?? 'Foto'}>
        {photo?.url && <Image src={photo.url} alt={photo.caption ?? 'Foto'} radius="sm" />}
        {photo && (
          <Text fz="xs" c="dimmed" mt="xs">
            {formatDateTime(photo.takenAt)}
            {photo.latitude != null && ` · ${photo.latitude.toFixed(6)}, ${photo.longitude?.toFixed(6)}`}
            {photo.accuracyM != null && ` (±${photo.accuracyM} m)`}
            {photo.heading != null && ` · direção ${Math.round(photo.heading)}°`}
          </Text>
        )}
      </Modal>
    </>
  );
}
