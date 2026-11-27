import { Anchor, Badge, Button, Card, Grid, Group, MultiSelect, SimpleGrid, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ENTERPRISE_TYPE_LABELS, type Enterprise, type Member, type Paginated } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { formatAddress } from '../../components/AddressFields';
import { AuditTimeline } from '../../components/AuditTimeline';
import { EmptyState, Field, LoadingBlock, PageHeader, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatArea, formatCar, formatDateTime, maskCnae } from '../../lib/masks';
import { formatDocument } from '../../lib/shared';
import { NotFoundPage } from '../NotFoundPage';
import { AreasCard } from './AreasCard';
import { PlantsPanel } from '../plants/PlantsPanel';

/** Equipe atribuída ao empreendimento (define o acesso de técnicos de campo). */
function TeamPanel({ enterprise }: { enterprise: Enterprise }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const assigned = (enterprise.assignments ?? []).map((a) => a.user);
  const [selection, setSelection] = useState<string[]>(assigned.map((u) => u.id));
  useEffect(() => setSelection((enterprise.assignments ?? []).map((a) => a.user.id)), [enterprise.assignments]);

  const team = useQuery({
    queryKey: ['users', 'team'],
    queryFn: () => api.get<Paginated<Member>>('/users', { status: 'ACTIVE', pageSize: 100 }),
    enabled: can('enterprises.assign'),
  });

  const save = useMutation({
    mutationFn: () => api.put<Enterprise>(`/enterprises/${enterprise.id}/assignments`, { userIds: selection }),
    onSuccess: (e) => {
      queryClient.setQueryData(['enterprise', e.id], e);
      queryClient.invalidateQueries({ queryKey: ['audit', 'enterprise', e.id] });
      notifySuccess('Equipe atualizada');
    },
    onError: (e) => notifyError(e),
  });

  const changed = JSON.stringify([...selection].sort()) !== JSON.stringify(assigned.map((u) => u.id).sort());

  return (
    <Card withBorder padding="lg">
      <Title order={5} mb={4}>Equipe atribuída</Title>
      <Text fz="sm" c="dimmed" mb="md">
        Técnicos de campo só visualizam os empreendimentos aos quais estão atribuídos ou dos quais são responsáveis.
      </Text>
      {can('enterprises.assign') ? (
        <Group align="flex-end">
          <MultiSelect
            style={{ flex: 1 }}
            label="Membros"
            searchable
            data={(team.data?.items ?? []).filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: `${m.name} (${m.roleLabel})` }))}
            value={selection}
            onChange={setSelection}
            nothingFoundMessage="Nenhum membro encontrado"
          />
          <Button onClick={() => save.mutate()} disabled={!changed} loading={save.isPending}>Salvar</Button>
        </Group>
      ) : !assigned.length ? (
        <EmptyState>Ninguém atribuído.</EmptyState>
      ) : (
        <Table><Table.Tbody>{assigned.map((u) => <Table.Tr key={u.id}><Table.Td>{u.name}</Table.Td><Table.Td c="dimmed">{u.email}</Table.Td></Table.Tr>)}</Table.Tbody></Table>
      )}
    </Card>
  );
}

export function EnterpriseDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: e, isLoading, error } = useQuery({ queryKey: ['enterprise', id], queryFn: () => api.get<Enterprise>(`/enterprises/${id}`) });

  const toggleStatus = useMutation({
    mutationFn: () => api.post<Enterprise>(`/enterprises/${id}/${e?.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: (updated) => {
      queryClient.setQueryData(['enterprise', id], updated);
      queryClient.invalidateQueries({ queryKey: ['enterprises'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'enterprise', id] });
      notifySuccess(updated.status === 'ACTIVE' ? 'Empreendimento reativado' : 'Empreendimento desativado');
    },
    onError: (err) => notifyError(err),
  });

  if (isLoading) return <LoadingBlock />;
  const tab = params.get('aba') ?? 'dados';
  if (error || !e) return <NotFoundPage />;
  const land = [e.carNumber, e.propertyRegistration, e.registryOffice, e.ccirNumber, e.nirfNumber, e.sigefCode, e.municipalPropertyRegistration].some(Boolean);

  const confirmToggle = () =>
    modals.openConfirmModal({
      title: e.status === 'ACTIVE' ? 'Desativar empreendimento' : 'Reativar empreendimento',
      children: <Text fz="sm">{e.status === 'ACTIVE' ? 'O empreendimento deixará de aparecer nas listas de ativos. Os dados e o histórico são preservados.' : 'O empreendimento voltará a ficar ativo.'}</Text>,
      labels: { confirm: e.status === 'ACTIVE' ? 'Desativar' : 'Reativar', cancel: 'Cancelar' },
      confirmProps: { color: e.status === 'ACTIVE' ? 'red' : 'forest' },
      onConfirm: () => toggleStatus.mutate(),
    });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Empreendimentos', to: '/empreendimentos' }, { label: e.name }]}
        title={<Group gap="sm">{e.name}<StatusBadge status={e.status} /></Group>}
        description={
          <>
            {ENTERPRISE_TYPE_LABELS[e.type]} · Cliente:{' '}
            {can('clients.read') ? <Anchor component={Link} to={`/clientes/${e.client.id}`} fz="sm">{e.client.tradeName || e.client.name}</Anchor> : e.client.tradeName || e.client.name}
          </>
        }
        actions={
          can('enterprises.write') && (
            <>
              <Button variant="default" onClick={confirmToggle}>{e.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}</Button>
              <Button component={Link} to={`/empreendimentos/${id}/editar`} leftSection={<IconEdit size={16} />}>Editar</Button>
            </>
          )
        }
      />

      <Tabs value={tab} onChange={(v) => setParams(v && v !== 'dados' ? { aba: v } : {}, { replace: true })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="dados">Dados</Tabs.Tab>
          <Tabs.Tab value="plantas">Plantas</Tabs.Tab>
          <Tabs.Tab value="equipe">Equipe ({e.assignments?.length ?? 0})</Tabs.Tab>
          {can('audit.read') && <Tabs.Tab value="historico">Histórico</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="dados">
          <Grid>
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Stack>
                <Card withBorder padding="lg">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    <Field label="Cliente">{`${e.client.tradeName || e.client.name} (${formatDocument(e.client.document)})`}</Field>
                    <Field label="Identificação interna">{e.code}</Field>
                    <Field label="Responsável">{e.responsible?.name}</Field>
                    <Field label="Endereço">{formatAddress(e)}</Field>
                    <Field label="Área total declarada">{e.totalAreaM2 != null ? formatArea(e.totalAreaM2) : null}</Field>
                    <Field label="Área construída declarada">{e.builtAreaM2 != null ? formatArea(e.builtAreaM2) : null}</Field>
                    <Field label="Cadastrado em">{formatDateTime(e.createdAt)}</Field>
                    <Field label="Última atualização">{formatDateTime(e.updatedAt)}</Field>
                  </SimpleGrid>
                </Card>

                <Card withBorder padding="lg">
                  <Title order={5} mb="sm">Atividades exercidas</Title>
                  {!e.activities?.length ? <Text fz="sm" c="dimmed">Nenhuma atividade informada.</Text> : (
                    <Stack gap="xs">
                      {e.activities.map((a) => (
                        <Group key={a.id} gap="xs" wrap="nowrap" align="flex-start">
                          {a.cnae && <Badge variant="outline" color="gray" ff="monospace">{maskCnae(a.cnae)}</Badge>}
                          <Text fz="sm">{a.description}</Text>
                          {a.isMain && <Badge size="xs">Principal</Badge>}
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Card>

                {land && (
                  <Card withBorder padding="lg">
                    <Title order={5} mb="sm">Identificação fundiária e registral</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                      {e.carNumber && <Field label="CAR"><Text span ff="monospace" fz="sm">{formatCar(e.carNumber)}</Text></Field>}
                      {e.propertyRegistration && <Field label="Matrícula">{e.propertyRegistration}</Field>}
                      {e.registryOffice && <Field label="Cartório / comarca">{e.registryOffice}</Field>}
                      {e.ccirNumber && <Field label="CCIR">{e.ccirNumber}</Field>}
                      {e.nirfNumber && <Field label="NIRF / CIB">{e.nirfNumber}</Field>}
                      {e.sigefCode && <Field label="SIGEF/INCRA">{e.sigefCode}</Field>}
                      {e.municipalPropertyRegistration && <Field label="Inscrição imobiliária">{e.municipalPropertyRegistration}</Field>}
                    </SimpleGrid>
                  </Card>
                )}

                {e.notes && (
                  <Card withBorder padding="lg">
                    <Title order={5} mb="xs">Observações</Title>
                    <Text fz="sm" style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</Text>
                  </Card>
                )}
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 5 }}>
              <AreasCard enterprise={e} />
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="plantas"><PlantsPanel enterpriseId={e.id} /></Tabs.Panel>
        <Tabs.Panel value="equipe"><TeamPanel enterprise={e} /></Tabs.Panel>

        {can('audit.read') && (
          <Tabs.Panel value="historico">
            <Card withBorder padding="lg"><AuditTimeline entityType="enterprise" entityId={id} /></Card>
          </Tabs.Panel>
        )}
      </Tabs>
    </>
  );
}
