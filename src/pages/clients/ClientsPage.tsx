import { Badge, Button, Card, Group, Pagination, SegmentedControl, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Client, Paginated } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, LoadingBlock, PageHeader, StatusBadge } from '../../components/common';
import { formatDocument } from '../../lib/shared';

const PAGE_SIZE = 20;

/** Lista e busca de clientes por nome, nome fantasia ou CPF/CNPJ (US13). */
export function ClientsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [debounced] = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { search: debounced, status, page }],
    queryFn: () => api.get<Paginated<Client>>('/clients', { search: debounced, status: status === 'ALL' ? undefined : status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Empresas e pessoas atendidas"
        actions={can('clients.write') && <Button component={Link} to="/clientes/novo" leftSection={<IconPlus size={16} />}>Novo cliente</Button>}
      />
      <Card withBorder padding={0}>
        <Group p="md" gap="sm" wrap="wrap">
          <TextInput
            placeholder="Buscar por nome, nome fantasia ou CPF/CNPJ"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            style={{ flex: 1, minWidth: 240 }}
            aria-label="Buscar clientes"
          />
          <SegmentedControl
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            data={[{ value: 'ACTIVE', label: 'Ativos' }, { value: 'INACTIVE', label: 'Inativos' }, { value: 'ALL', label: 'Todos' }]}
          />
        </Group>

        {isLoading ? <LoadingBlock /> : !data?.items.length ? (
          <EmptyState>{debounced ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente cadastrado ainda.'}</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>CPF/CNPJ</Table.Th>
                  <Table.Th>Município</Table.Th>
                  <Table.Th ta="center">Empreend.</Table.Th>
                  <Table.Th>Situação</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((c) => (
                  <Table.Tr key={c.id} className="clickable-row" onClick={() => navigate(`/clientes/${c.id}`)}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Badge size="xs" variant="outline" color={c.type === 'PJ' ? 'slateBlue' : 'gray'}>{c.type}</Badge>
                        <div>
                          <Text fz="sm" fw={600} component={Link} to={`/clientes/${c.id}`} c="dark" style={{ textDecoration: 'none' }}>{c.name}</Text>
                          {c.tradeName && <Text fz="xs" c="dimmed">{c.tradeName}</Text>}
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td><Text fz="sm" ff="monospace">{formatDocument(c.document)}</Text></Table.Td>
                    <Table.Td><Text fz="sm">{[c.city, c.state].filter(Boolean).join('/') || '—'}</Text></Table.Td>
                    <Table.Td ta="center">{c._count?.enterprises ?? 0}</Table.Td>
                    <Table.Td><StatusBadge status={c.status} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {data && data.total > PAGE_SIZE && (
          <Group justify="space-between" p="md">
            <Text fz="sm" c="dimmed">{data.total} clientes</Text>
            <Pagination total={Math.ceil(data.total / PAGE_SIZE)} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Card>
    </>
  );
}
