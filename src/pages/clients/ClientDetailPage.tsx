import { ActionIcon, Anchor, Badge, Button, Card, Group, SimpleGrid, Stack, Table, Tabs, Text, Title, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ENTERPRISE_TYPE_LABELS, type Client, type Contact } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { formatAddress } from '../../components/AddressFields';
import { AuditTimeline } from '../../components/AuditTimeline';
import { EmptyState, Field, LoadingBlock, PageHeader, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatDateTime, maskCnae, maskPhone } from '../../lib/masks';
import { formatDocument } from '../../lib/shared';
import { NotFoundPage } from '../NotFoundPage';
import { ContactModal } from './ContactModal';

/** Detalhe do cliente: dados, contatos, empreendimentos e histórico (US12, US14). */
export function ClientDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [contactModal, setContactModal] = useState<{ open: boolean; contact: Contact | null }>({ open: false, contact: null });
  const { data: client, isLoading, error } = useQuery({ queryKey: ['client', id], queryFn: () => api.get<Client>(`/clients/${id}`) });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['client', id] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['audit', 'client', id] });
  };

  const toggleStatus = useMutation({
    mutationFn: () => api.post(`/clients/${id}/${client?.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: () => { refresh(); notifySuccess(client?.status === 'ACTIVE' ? 'Cliente desativado' : 'Cliente reativado'); },
    onError: (e) => notifyError(e),
  });

  const removeContact = useMutation({
    mutationFn: (contactId: string) => api.delete(`/clients/${id}/contacts/${contactId}`),
    onSuccess: () => { refresh(); notifySuccess('Contato removido'); },
    onError: (e) => notifyError(e),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !client) return <NotFoundPage />;
  const writable = can('clients.write');

  const confirmToggle = () =>
    modals.openConfirmModal({
      title: client.status === 'ACTIVE' ? 'Desativar cliente' : 'Reativar cliente',
      children: <Text fz="sm">{client.status === 'ACTIVE' ? 'O cliente deixará de aparecer nas listas de ativos. Os dados e o histórico são preservados.' : 'O cliente voltará a ficar ativo.'}</Text>,
      labels: { confirm: client.status === 'ACTIVE' ? 'Desativar' : 'Reativar', cancel: 'Cancelar' },
      confirmProps: { color: client.status === 'ACTIVE' ? 'red' : 'forest' },
      onConfirm: () => toggleStatus.mutate(),
    });

  const confirmRemoveContact = (c: Contact) =>
    modals.openConfirmModal({
      title: 'Remover contato',
      children: <Text fz="sm">Remover o contato <b>{c.name}</b>?</Text>,
      labels: { confirm: 'Remover', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => removeContact.mutate(c.id),
    });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Clientes', to: '/clientes' }, { label: client.name }]}
        title={
          <Group gap="sm">
            {client.name}
            <StatusBadge status={client.status} />
          </Group>
        }
        description={`${client.type === 'PJ' ? 'CNPJ' : 'CPF'} ${formatDocument(client.document)}${client.tradeName ? ` · ${client.tradeName}` : ''}`}
        actions={
          writable && (
            <>
              <Button variant="default" color={client.status === 'ACTIVE' ? 'red' : undefined} onClick={confirmToggle}>
                {client.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
              </Button>
              <Button component={Link} to={`/clientes/${id}/editar`} leftSection={<IconEdit size={16} />}>Editar</Button>
            </>
          )
        }
      />

      <Tabs defaultValue="dados" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="dados">Dados</Tabs.Tab>
          <Tabs.Tab value="contatos">Contatos ({client.contacts?.length ?? 0})</Tabs.Tab>
          <Tabs.Tab value="empreendimentos">Empreendimentos ({client.enterprises?.length ?? 0})</Tabs.Tab>
          {can('audit.read') && <Tabs.Tab value="historico">Histórico</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="dados">
          <Card withBorder padding="lg">
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
              <Field label="Tipo">{client.type === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</Field>
              <Field label="Inscrição estadual">{client.stateRegistration}</Field>
              <Field label="Inscrição municipal">{client.municipalRegistration}</Field>
              <Field label="CNAE principal">{client.mainCnae && maskCnae(client.mainCnae)}</Field>
              <Field label="CNAEs secundários">{client.secondaryCnaes.map(maskCnae).join(', ')}</Field>
              <Field label="E-mail">{client.email}</Field>
              <Field label="Telefone">{client.phone && maskPhone(client.phone)}</Field>
              <Field label="Endereço">{formatAddress(client)}</Field>
              <Field label="Cadastrado em">{formatDateTime(client.createdAt)}</Field>
            </SimpleGrid>
            {client.notes && (
              <Stack gap={4} mt="lg">
                <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>Observações</Text>
                <Text fz="sm" style={{ whiteSpace: 'pre-wrap' }}>{client.notes}</Text>
              </Stack>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="contatos">
          <Card withBorder padding={0}>
            <Group justify="space-between" p="md">
              <Title order={5}>Contatos e responsáveis</Title>
              {writable && (
                <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setContactModal({ open: true, contact: null })}>Adicionar</Button>
              )}
            </Group>
            {!client.contacts?.length ? <EmptyState>Nenhum contato cadastrado.</EmptyState> : (
              <Table.ScrollContainer minWidth={600}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr><Table.Th>Nome</Table.Th><Table.Th>E-mail</Table.Th><Table.Th>Telefone</Table.Th>{writable && <Table.Th w={90} />}</Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {client.contacts.map((c) => (
                      <Table.Tr key={c.id}>
                        <Table.Td>
                          <Group gap={6}>
                            <Text fz="sm" fw={600}>{c.name}</Text>
                            {c.isPrimary && <Badge size="xs">Principal</Badge>}
                            {c.isLegalRepresentative && <Badge size="xs" color="slateBlue" variant="light">Repr. legal</Badge>}
                          </Group>
                          {c.position && <Text fz="xs" c="dimmed">{c.position}</Text>}
                        </Table.Td>
                        <Table.Td>{c.email ? <Anchor href={`mailto:${c.email}`} fz="sm">{c.email}</Anchor> : '—'}</Table.Td>
                        <Table.Td><Text fz="sm">{c.phone ? maskPhone(c.phone) : '—'}</Text></Table.Td>
                        {writable && (
                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              <Tooltip label="Editar"><ActionIcon variant="subtle" aria-label={`Editar ${c.name}`} onClick={() => setContactModal({ open: true, contact: c })}><IconPencil size={16} /></ActionIcon></Tooltip>
                              <Tooltip label="Remover"><ActionIcon variant="subtle" color="red" aria-label={`Remover ${c.name}`} onClick={() => confirmRemoveContact(c)}><IconTrash size={16} /></ActionIcon></Tooltip>
                            </Group>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="empreendimentos">
          <Card withBorder padding={0}>
            <Group justify="space-between" p="md">
              <Title order={5}>Empreendimentos</Title>
              {can('enterprises.write') && client.status === 'ACTIVE' && (
                <Button size="xs" leftSection={<IconPlus size={14} />} component={Link} to={`/empreendimentos/novo?clientId=${id}`}>Novo empreendimento</Button>
              )}
            </Group>
            {!client.enterprises?.length ? <EmptyState>Nenhum empreendimento vinculado.</EmptyState> : (
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Tbody>
                  {client.enterprises.map((e) => (
                    <Table.Tr key={e.id} className="clickable-row" onClick={() => navigate(`/empreendimentos/${e.id}`)}>
                      <Table.Td>
                        <Text fz="sm" fw={600}>{e.name}</Text>
                        <Text fz="xs" c="dimmed">{ENTERPRISE_TYPE_LABELS[e.type]}</Text>
                      </Table.Td>
                      <Table.Td><Text fz="sm">{[e.city, e.state].filter(Boolean).join('/') || '—'}</Text></Table.Td>
                      <Table.Td><StatusBadge status={e.status} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>

        {can('audit.read') && (
          <Tabs.Panel value="historico">
            <Card withBorder padding="lg"><AuditTimeline entityType="client" entityId={id} /></Card>
          </Tabs.Panel>
        )}
      </Tabs>

      <ContactModal clientId={id} contact={contactModal.contact} opened={contactModal.open} onClose={() => setContactModal({ open: false, contact: null })} />
    </>
  );
}
