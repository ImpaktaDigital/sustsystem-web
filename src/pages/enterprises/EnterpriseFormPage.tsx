import { zodResolver } from '@hookform/resolvers/zod';
import {
  ActionIcon, Alert, Button, Card, Checkbox, Grid, Group, NumberInput, Select, Stack, Text, Textarea, TextInput, Title, Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCurrentLocation, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../../api/client';
import { ENTERPRISE_TYPE_LABELS, type Client, type Enterprise, type EnterpriseType, type Member, type Paginated } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { AddressFields } from '../../components/AddressFields';
import { LoadingBlock, PageHeader } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatCar, maskCnae } from '../../lib/masks';
import { formatDocument, onlyDigits, utmZoneFor } from '../../lib/shared';
import { MapView } from '../../map/MapView';

const optional = z.string().trim().optional().or(z.literal(''));
const CAR_RULE = /^[A-Z]{2}-\d{7}-[0-9A-Z]{32}$/;

const schema = z
  .object({
    clientId: z.string({ required_error: 'Selecione o cliente' }).min(1, 'Selecione o cliente'),
    name: z.string().trim().min(2, 'Informe o nome'),
    code: optional,
    type: z.string({ required_error: 'Selecione o tipo' }).min(1, 'Selecione o tipo'),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    totalAreaM2: z.number().min(0).nullable(),
    builtAreaM2: z.number().min(0).nullable(),
    carNumber: z.string().optional().refine((v) => !v || CAR_RULE.test(v.toUpperCase().replace(/[\s.]/g, '')), 'Formato esperado: UF-código IBGE (7 dígitos)-32 caracteres'),
    propertyRegistration: optional,
    registryOffice: optional,
    ccirNumber: optional,
    nirfNumber: optional,
    sigefCode: optional,
    municipalPropertyRegistration: optional,
    responsibleUserId: z.string().nullable(),
    zipCode: optional, street: optional, number: optional, complement: optional, district: optional, city: optional,
    state: z.string().nullable().optional(),
    notes: optional,
    activities: z.array(
      z.object({
        cnae: z.string().optional().refine((v) => !v || onlyDigits(v).length === 7, 'CNAE com 7 dígitos'),
        description: z.string().trim().min(2, 'Descreva a atividade'),
        isMain: z.boolean(),
      }),
    ),
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), { path: ['longitude'], message: 'Informe latitude e longitude juntas' });

type FormValues = z.infer<typeof schema>;

const empty: FormValues = {
  clientId: '', name: '', code: '', type: '', latitude: null, longitude: null, totalAreaM2: null, builtAreaM2: null,
  carNumber: '', propertyRegistration: '', registryOffice: '', ccirNumber: '', nirfNumber: '', sigefCode: '', municipalPropertyRegistration: '',
  responsibleUserId: null, zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: null, notes: '', activities: [],
};

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

function toPayload(v: FormValues, editing: boolean) {
  const blank = editing ? null : undefined;
  const clean = (s?: string | null) => (s && s.trim() ? s.trim() : blank);
  return {
    ...(editing ? {} : { clientId: v.clientId }),
    name: v.name.trim(),
    code: clean(v.code),
    type: v.type as EnterpriseType,
    latitude: v.latitude ?? blank,
    longitude: v.longitude ?? blank,
    totalAreaM2: v.totalAreaM2 ?? blank,
    builtAreaM2: v.builtAreaM2 ?? blank,
    carNumber: clean(v.carNumber),
    propertyRegistration: clean(v.propertyRegistration),
    registryOffice: clean(v.registryOffice),
    ccirNumber: clean(v.ccirNumber),
    nirfNumber: clean(v.nirfNumber),
    sigefCode: clean(v.sigefCode),
    municipalPropertyRegistration: clean(v.municipalPropertyRegistration),
    responsibleUserId: v.responsibleUserId ?? blank,
    zipCode: v.zipCode ? onlyDigits(v.zipCode) : blank,
    street: clean(v.street), number: clean(v.number), complement: clean(v.complement), district: clean(v.district), city: clean(v.city),
    state: v.state || blank,
    notes: clean(v.notes),
    activities: v.activities.map((a) => ({ cnae: a.cnae ? onlyDigits(a.cnae) : undefined, description: a.description.trim(), isMain: a.isMain })),
  };
}

/** Seleção de cliente com busca no servidor. */
function ClientSelect({ value, onChange, error, disabled, initialLabel }: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean; initialLabel?: string }) {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const { data } = useQuery({
    queryKey: ['clients', 'select', debounced],
    queryFn: () => api.get<Paginated<Client>>('/clients', { search: debounced, status: 'ACTIVE', pageSize: 30 }),
    enabled: !disabled,
  });
  const options = useMemo(() => {
    const list = (data?.items ?? []).map((c) => ({ value: c.id, label: `${c.tradeName || c.name} — ${formatDocument(c.document)}` }));
    if (value && initialLabel && !list.some((o) => o.value === value)) list.unshift({ value, label: initialLabel });
    return list;
  }, [data, value, initialLabel]);

  return (
    <Select
      label="Cliente"
      withAsterisk
      searchable
      disabled={disabled}
      placeholder="Buscar por nome ou CNPJ"
      data={options}
      value={value || null}
      onChange={(v) => onChange(v ?? '')}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      nothingFoundMessage="Nenhum cliente ativo encontrado"
      error={error}
    />
  );
}

/** Cadastro e edição de empreendimento (US15–US19). */
export function EnterpriseFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [locating, setLocating] = useState(false);

  const existing = useQuery({ queryKey: ['enterprise', id], queryFn: () => api.get<Enterprise>(`/enterprises/${id}`), enabled: editing });
  const preselected = useQuery({
    queryKey: ['client', params.get('clientId')],
    queryFn: () => api.get<Client>(`/clients/${params.get('clientId')}`),
    enabled: !editing && !!params.get('clientId'),
  });
  const team = useQuery({
    queryKey: ['users', 'team'],
    queryFn: () => api.get<Paginated<Member>>('/users', { status: 'ACTIVE', pageSize: 100 }),
    enabled: can('users.read'),
  });

  const { register, control, handleSubmit, reset, setValue, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...empty, clientId: params.get('clientId') ?? '' },
  });
  const activities = useFieldArray({ control, name: 'activities' });
  const [lat, lng, type] = watch(['latitude', 'longitude', 'type']);

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    reset({
      clientId: e.clientId, name: e.name, code: e.code ?? '', type: e.type, latitude: e.latitude, longitude: e.longitude,
      totalAreaM2: e.totalAreaM2, builtAreaM2: e.builtAreaM2, carNumber: formatCar(e.carNumber), propertyRegistration: e.propertyRegistration ?? '',
      registryOffice: e.registryOffice ?? '', ccirNumber: e.ccirNumber ?? '', nirfNumber: e.nirfNumber ?? '', sigefCode: e.sigefCode ?? '',
      municipalPropertyRegistration: e.municipalPropertyRegistration ?? '', responsibleUserId: e.responsibleUserId,
      zipCode: e.zipCode ?? '', street: e.street ?? '', number: e.number ?? '', complement: e.complement ?? '', district: e.district ?? '',
      city: e.city ?? '', state: e.state, notes: e.notes ?? '',
      activities: (e.activities ?? []).map((a) => ({ cnae: a.cnae ? maskCnae(a.cnae) : '', description: a.description, isMain: a.isMain })),
    });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      editing ? api.patch<Enterprise>(`/enterprises/${id}`, toPayload(v, true)) : api.post<Enterprise>('/enterprises', toPayload(v, false)),
    onSuccess: (e) => {
      queryClient.invalidateQueries({ queryKey: ['enterprises'] });
      queryClient.invalidateQueries({ queryKey: ['client', e.clientId] });
      queryClient.setQueryData(['enterprise', e.id], e);
      notifySuccess(editing ? 'Empreendimento atualizado' : 'Empreendimento cadastrado');
      navigate(`/empreendimentos/${e.id}`);
    },
    onError: (err) => notifyError(err),
  });

  const setPoint = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    setValue('latitude', round7(latitude), { shouldDirty: true, shouldValidate: true });
    setValue('longitude', round7(longitude), { shouldDirty: true, shouldValidate: true });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return notifyError(null, 'Geolocalização indisponível neste navegador');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        notifySuccess(`Localização obtida (precisão estimada: ${Math.round(pos.coords.accuracy)} m)`);
        setLocating(false);
      },
      () => {
        notifyError(null, 'Não foi possível obter a localização');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  if (editing && existing.isLoading) return <LoadingBlock />;
  const utm = lat != null && lng != null ? utmZoneFor(lng, lat) : null;
  const rural = type === 'RURAL_PROPERTY';
  const teamOptions = (team.data?.items ?? []).filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: `${m.name} (${m.roleLabel})` }));

  return (
    <>
      <PageHeader
        title={editing ? 'Editar empreendimento' : 'Novo empreendimento'}
        breadcrumbs={[
          { label: 'Empreendimentos', to: '/empreendimentos' },
          ...(editing ? [{ label: existing.data?.name ?? '', to: `/empreendimentos/${id}` }] : []),
          { label: editing ? 'Editar' : 'Novo' },
        ]}
      />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Stack>
          <Card withBorder padding="lg">
            <Title order={4} mb="md">Identificação</Title>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Controller
                  control={control}
                  name="clientId"
                  render={({ field }) => (
                    <ClientSelect
                      value={field.value}
                      onChange={field.onChange}
                      disabled={editing}
                      error={formState.errors.clientId?.message}
                      initialLabel={
                        existing.data ? existing.data.client.tradeName || existing.data.client.name
                          : preselected.data ? preselected.data.tradeName || preselected.data.name : undefined
                      }
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label="Nome do empreendimento" withAsterisk {...register('name')} error={formState.errors.name?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select
                      label="Tipo"
                      withAsterisk
                      data={Object.entries(ENTERPRISE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                      {...field}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? '')}
                      error={formState.errors.type?.message}
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <TextInput label="Identificação interna" description="Código, unidade, número" {...register('code')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                {can('users.read') ? (
                  <Controller
                    control={control}
                    name="responsibleUserId"
                    render={({ field }) => (
                      <Select label="Responsável" description="Membro da equipe" clearable searchable data={teamOptions} {...field} value={field.value} />
                    )}
                  />
                ) : null}
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Controller
                  control={control}
                  name="totalAreaM2"
                  render={({ field }) => (
                    <NumberInput label="Área total (m²)" description="Declarada" min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," {...field} value={field.value ?? ''} onChange={(v) => field.onChange(v === '' ? null : Number(v))} />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Controller
                  control={control}
                  name="builtAreaM2"
                  render={({ field }) => (
                    <NumberInput label="Área construída (m²)" description="Declarada" min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," {...field} value={field.value ?? ''} onChange={(v) => field.onChange(v === '' ? null : Number(v))} />
                  )}
                />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder padding="lg">
            <Group justify="space-between" mb="xs">
              <Title order={4}>Localização</Title>
              <Button variant="light" size="xs" leftSection={<IconCurrentLocation size={14} />} loading={locating} onClick={useMyLocation}>
                Usar minha localização
              </Button>
            </Group>
            <Text fz="sm" c="dimmed" mb="sm">Clique no mapa ou arraste o marcador para definir o ponto de referência do empreendimento.</Text>
            <MapView
              height={360}
              selected={lat != null && lng != null ? { latitude: lat, longitude: lng } : null}
              onPick={setPoint}
              initialBasemap="satellite"
            />
            <Grid mt="sm">
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Controller
                  control={control}
                  name="latitude"
                  render={({ field }) => (
                    <NumberInput label="Latitude" decimalScale={7} min={-90} max={90} {...field} value={field.value ?? ''} onChange={(v) => field.onChange(v === '' ? null : Number(v))} error={formState.errors.latitude?.message} />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Controller
                  control={control}
                  name="longitude"
                  render={({ field }) => (
                    <NumberInput label="Longitude" decimalScale={7} min={-180} max={180} {...field} value={field.value ?? ''} onChange={(v) => field.onChange(v === '' ? null : Number(v))} error={formState.errors.longitude?.message} />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text fz="sm" fw={500} mt={4}>Sistema de referência</Text>
                <Text fz="sm" c="dimmed">
                  {utm ? `Graus decimais (WGS 84 / SIRGAS 2000) · ${utm.label} (EPSG:${utm.epsg})` : 'Defina um ponto para calcular a zona UTM'}
                </Text>
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder padding="lg">
            <Title order={4} mb="md">Endereço</Title>
            <AddressFields control={control} setValue={setValue} />
          </Card>

          <Card withBorder padding="lg">
            <Title order={4} mb={4}>Identificação fundiária e registral</Title>
            <Text fz="sm" c="dimmed" mb="md">Todos os campos são opcionais.</Text>
            {rural && <Alert variant="light" color="slateBlue" mb="md">Para propriedades rurais, informe preferencialmente o CAR, o CCIR e a matrícula.</Alert>}
            <Grid>
              <Grid.Col span={{ base: 12, md: 8 }}>
                <TextInput label="CAR (Cadastro Ambiental Rural)" placeholder="UF-0000000-XXXX.XXXX.XXXX.XXXX.XXXX.XXXX.XXXX.XXXX" {...register('carNumber')} error={formState.errors.carNumber?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}><TextInput label="Matrícula do imóvel" {...register('propertyRegistration')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 6 }}><TextInput label="Cartório / comarca" {...register('registryOffice')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><TextInput label="CCIR (INCRA)" {...register('ccirNumber')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}><TextInput label="NIRF / CIB" {...register('nirfNumber')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Certificação SIGEF/INCRA" {...register('sigefCode')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Inscrição imobiliária (IPTU)" {...register('municipalPropertyRegistration')} /></Grid.Col>
            </Grid>
          </Card>

          <Card withBorder padding="lg">
            <Group justify="space-between" mb="md">
              <Title order={4}>Atividades exercidas</Title>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => activities.append({ cnae: '', description: '', isMain: activities.fields.length === 0 })}>
                Adicionar atividade
              </Button>
            </Group>
            {!activities.fields.length && <Text fz="sm" c="dimmed">Nenhuma atividade informada.</Text>}
            <Stack gap="sm">
              {activities.fields.map((f, i) => (
                <Grid key={f.id} align="flex-end">
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <Controller
                      control={control}
                      name={`activities.${i}.cnae`}
                      render={({ field }) => (
                        <TextInput label={i === 0 ? 'CNAE' : undefined} aria-label="CNAE" placeholder="0000-0/00" {...field} value={maskCnae(field.value ?? '')} error={formState.errors.activities?.[i]?.cnae?.message} />
                      )}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label={i === 0 ? 'Descrição' : undefined} aria-label="Descrição da atividade" {...register(`activities.${i}.description`)} error={formState.errors.activities?.[i]?.description?.message} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 9, sm: 2 }}>
                    <Controller
                      control={control}
                      name={`activities.${i}.isMain`}
                      render={({ field }) => (
                        <Checkbox
                          label="Principal"
                          mb={8}
                          checked={field.value}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            if (checked) activities.fields.forEach((_, j) => j !== i && setValue(`activities.${j}.isMain`, false));
                            field.onChange(checked);
                          }}
                        />
                      )}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 3, sm: 1 }}>
                    <Tooltip label="Remover">
                      <ActionIcon variant="subtle" color="red" mb={6} aria-label="Remover atividade" onClick={() => activities.remove(i)}><IconTrash size={16} /></ActionIcon>
                    </Tooltip>
                  </Grid.Col>
                </Grid>
              ))}
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Textarea label="Observações" autosize minRows={3} {...register('notes')} />
          </Card>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Salvar alterações' : 'Cadastrar empreendimento'}</Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}
