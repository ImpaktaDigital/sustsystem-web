import { Button, Card, Group, Pagination, SegmentedControl, Select, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { ENTERPRISE_TYPE_LABELS, type Enterprise, type Paginated } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { UFS } from '../../components/AddressFields';
import { EmptyState, LoadingBlock, PageHeader, StatusBadge } from '../../components/common';

const PAGE_SIZE = 20;

export function EnterprisesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [type, setType] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [debounced] = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['enterprises', { search: debounced, status, type, state, page }],
    queryFn: () =>
      api.get<Paginated<Enterprise>>('/enterprises', { search: debounced, status: status === 'ALL' ? undefined : status, type, state, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="Empreendimentos"
        description={can('enterprises.read_all') ? 'Fábricas, unidades, instalações e propriedades' : 'Empreendimentos atribuídos a você'}
        actions={can('enterprises.write') && <Button component={Link} to="/empreendimentos/novo" leftSection={<IconPlus size={16} />}>Novo empreendimento</Button>}
      />
      <Card withBorder padding={0}>
        <Group p="md" gap="sm" wrap="wrap">
          <TextInput
            placeholder="Buscar por nome, identificação, município ou CAR"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => resetPage(setSearch)(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 240 }}
            aria-label="Buscar empreendimentos"
          />
          <Select
            placeholder="Tipo"
            clearable
            data={Object.entries(ENTERPRISE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            value={type}
            onChange={resetPage(setType)}
            w={210}
            aria-label="Filtrar por tipo"
          />
          <Select placeholder="UF" clearable searchable data={UFS} value={state} onChange={resetPage(setState)} w={90} aria-label="Filtrar por UF" />
          <SegmentedControl
            value={status}
            onChange={resetPage(setStatus)}
            data={[{ value: 'ACTIVE', label: 'Ativos' }, { value: 'INACTIVE', label: 'Inativos' }, { value: 'ALL', label: 'Todos' }]}
          />
        </Group>

        {isLoading ? <LoadingBlock /> : !data?.items.length ? (
          <EmptyState>{debounced || type || state ? 'Nenhum empreendimento encontrado com esses filtros.' : 'Nenhum empreendimento cadastrado ainda.'}</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Empreendimento</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Município</Table.Th>
                  <Table.Th>Responsável</Table.Th>
                  <Table.Th>Situação</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((e) => (
                  <Table.Tr key={e.id} className="clickable-row" onClick={() => navigate(`/empreendimentos/${e.id}`)}>
                    <Table.Td>
                      <Text fz="sm" fw={600} component={Link} to={`/empreendimentos/${e.id}`} c="dark" style={{ textDecoration: 'none' }}>{e.name}</Text>
                      <Text fz="xs" c="dimmed">{ENTERPRISE_TYPE_LABELS[e.type]}{e.code ? ` · ${e.code}` : ''}</Text>
                    </Table.Td>
                    <Table.Td><Text fz="sm">{e.client.tradeName || e.client.name}</Text></Table.Td>
                    <Table.Td><Text fz="sm">{[e.city, e.state].filter(Boolean).join('/') || '—'}</Text></Table.Td>
                    <Table.Td><Text fz="sm">{e.responsible?.name ?? '—'}</Text></Table.Td>
                    <Table.Td><StatusBadge status={e.status} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {data && data.total > PAGE_SIZE && (
          <Group justify="space-between" p="md">
            <Text fz="sm" c="dimmed">{data.total} empreendimentos</Text>
            <Pagination total={Math.ceil(data.total / PAGE_SIZE)} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Card>
    </>
  );
}
