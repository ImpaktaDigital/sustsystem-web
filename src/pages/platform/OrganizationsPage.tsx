import { zodResolver } from '@hookform/resolvers/zod';
import { ActionIcon, Button, Card, Divider, Drawer, Group, Menu, Modal, Pagination, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconBuildingOff, IconBuildingCommunity, IconDots, IconEye, IconPencil, IconPlus, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Organization, Paginated } from '../../api/types';
import { EmptyState, LoadingBlock, PageHeader, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatDateTime, maskCnpj } from '../../lib/masks';
import { formatDocument, isValidCnpj, onlyDigits } from '../../lib/shared';

const PAGE_SIZE = 20;

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome'),
  document: z.string().optional().refine((v) => !v || isValidCnpj(v), 'CNPJ inválido'),
  adminName: z.string().trim(),
  adminEmail: z.string().trim(),
});
type FormValues = z.infer<typeof schema>;

/** Criação (com administrador convidado) e edição de organização pelo operador da plataforma. */
function OrganizationModal({ org, opened, onClose }: { org: Organization | null; opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const creating = !org;
  const { register, control, handleSubmit, reset, setError, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (opened) reset({ name: org?.name ?? '', document: org?.document ?? '', adminName: '', adminEmail: '' });
  }, [opened, org, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const document = v.document ? onlyDigits(v.document) : undefined;
      return creating
        ? api.post<Organization>('/platform/organizations', { name: v.name, document, admin: { name: v.adminName, email: v.adminEmail } })
        : api.patch<Organization>(`/platform/organizations/${org!.id}`, { name: v.name, document });
    },
    onSuccess: (_o, v) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      notifySuccess(creating ? `Organização criada. Convite enviado para ${v.adminEmail}.` : 'Organização atualizada');
      onClose();
    },
    onError: (e) => notifyError(e),
  });

  const submit = handleSubmit((v) => {
    if (creating) {
      if (v.adminName.length < 2) return setError('adminName', { message: 'Informe o nome do administrador' });
      if (!z.string().email().safeParse(v.adminEmail).success) return setError('adminEmail', { message: 'E-mail inválido' });
    }
    save.mutate(v);
  });

  return (
    <Modal opened={opened} onClose={onClose} title={creating ? 'Nova organização' : 'Editar organização'} size="lg">
      <form onSubmit={submit} noValidate>
        <Stack>
          <TextInput label="Nome" withAsterisk data-autofocus {...register('name')} error={formState.errors.name?.message} />
          <Controller
            control={control}
            name="document"
            render={({ field }) => <TextInput label="CNPJ" description="Opcional" {...field} value={maskCnpj(field.value ?? '')} error={formState.errors.document?.message} />}
          />
          {creating && (
            <>
              <Divider label="Administrador da organização" labelPosition="left" />
              <Text fz="sm" c="dimmed">Ele receberá um convite por e-mail para definir a senha. Se já tiver conta, apenas ganha acesso.</Text>
              <TextInput label="Nome" withAsterisk {...register('adminName')} error={formState.errors.adminName?.message} />
              <TextInput label="E-mail" type="email" withAsterisk {...register('adminEmail')} error={formState.errors.adminEmail?.message} />
            </>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>{creating ? 'Criar organização' : 'Salvar'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function OrganizationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['platform', 'organization', id], queryFn: () => api.get<Organization>(`/platform/organizations/${id}`), enabled: !!id });
  return (
    <Drawer opened={!!id} onClose={onClose} position="right" size="lg" title={data?.name ?? 'Organização'}>
      {isLoading || !data ? <LoadingBlock /> : (
        <Stack>
          <Group gap="xl">
            <div><Text fz="xs" c="dimmed">CNPJ</Text><Text fz="sm">{data.document ? formatDocument(data.document) : '—'}</Text></div>
            <div><Text fz="xs" c="dimmed">Clientes</Text><Text fz="sm">{data._count?.clients ?? 0}</Text></div>
            <div><Text fz="xs" c="dimmed">Empreendimentos</Text><Text fz="sm">{data._count?.enterprises ?? 0}</Text></div>
            <div><Text fz="xs" c="dimmed">Criada em</Text><Text fz="sm">{formatDateTime(data.createdAt)}</Text></div>
          </Group>
          <Title order={5}>Membros</Title>
          <Table>
            <Table.Tbody>
              {data.members?.map((m) => (
                <Table.Tr key={m.user.id}>
                  <Table.Td><Text fz="sm" fw={600}>{m.user.name}</Text><Text fz="xs" c="dimmed">{m.user.email}</Text></Table.Td>
                  <Table.Td><Text fz="sm">{m.roleLabel}</Text></Table.Td>
                  <Table.Td><Text fz="xs" c="dimmed">{m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt) : 'Nunca acessou'}</Text></Table.Td>
                  <Table.Td><StatusBadge status={m.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Drawer>
  );
}

/** Administração da plataforma: organizações (escritórios clientes do SaaS). */
export function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; org: Organization | null }>({ open: false, org: null });
  const [viewing, setViewing] = useState<string | null>(null);
  const [debounced] = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'organizations', { search: debounced, page }],
    queryFn: () => api.get<Paginated<Organization>>('/platform/organizations', { search: debounced, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (org: Organization) => api.post(`/platform/organizations/${org.id}/${org.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: (_r, org) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      notifySuccess(org.status === 'ACTIVE' ? 'Organização desativada' : 'Organização reativada');
    },
    onError: (e) => notifyError(e),
  });

  const confirmToggle = (org: Organization) =>
    modals.openConfirmModal({
      title: org.status === 'ACTIVE' ? 'Desativar organização' : 'Reativar organização',
      children: (
        <Text fz="sm">
          {org.status === 'ACTIVE'
            ? <>Todos os membros de <b>{org.name}</b> perderão o acesso imediatamente. Os dados são preservados.</>
            : <>Os membros de <b>{org.name}</b> voltarão a ter acesso.</>}
        </Text>
      ),
      labels: { confirm: org.status === 'ACTIVE' ? 'Desativar' : 'Reativar', cancel: 'Cancelar' },
      confirmProps: { color: org.status === 'ACTIVE' ? 'red' : 'forest' },
      onConfirm: () => toggle.mutate(org),
    });

  return (
    <>
      <PageHeader
        title="Organizações"
        description="Administração da plataforma — escritórios e empresas que usam o SustSystem"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true, org: null })}>Nova organização</Button>}
      />
      <Card withBorder padding={0}>
        <Group p="md">
          <TextInput
            placeholder="Buscar por nome ou CNPJ"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            style={{ flex: 1 }}
            aria-label="Buscar organizações"
          />
        </Group>
        {isLoading ? <LoadingBlock /> : !data?.items.length ? <EmptyState>Nenhuma organização encontrada.</EmptyState> : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Organização</Table.Th><Table.Th ta="center">Membros</Table.Th><Table.Th ta="center">Clientes</Table.Th>
                  <Table.Th ta="center">Empreend.</Table.Th><Table.Th>Criada em</Table.Th><Table.Th>Situação</Table.Th><Table.Th w={50} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td>
                      <Text fz="sm" fw={600}>{o.name}</Text>
                      {o.document && <Text fz="xs" c="dimmed">{formatDocument(o.document)}</Text>}
                    </Table.Td>
                    <Table.Td ta="center">{o._count?.members ?? 0}</Table.Td>
                    <Table.Td ta="center">{o._count?.clients ?? 0}</Table.Td>
                    <Table.Td ta="center">{o._count?.enterprises ?? 0}</Table.Td>
                    <Table.Td><Text fz="sm">{formatDateTime(o.createdAt)}</Text></Table.Td>
                    <Table.Td><StatusBadge status={o.status} /></Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" aria-label={`Ações para ${o.name}`}><IconDots size={16} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconEye size={14} />} onClick={() => setViewing(o.id)}>Ver membros</Menu.Item>
                          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setModal({ open: true, org: o })}>Editar</Menu.Item>
                          {o.status === 'ACTIVE' ? (
                            <Menu.Item color="red" leftSection={<IconBuildingOff size={14} />} onClick={() => confirmToggle(o)}>Desativar</Menu.Item>
                          ) : (
                            <Menu.Item leftSection={<IconBuildingCommunity size={14} />} onClick={() => confirmToggle(o)}>Reativar</Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {data && data.total > PAGE_SIZE && (
          <Group justify="flex-end" p="md"><Pagination total={Math.ceil(data.total / PAGE_SIZE)} value={page} onChange={setPage} size="sm" /></Group>
        )}
      </Card>
      <OrganizationModal org={modal.org} opened={modal.open} onClose={() => setModal({ open: false, org: null })} />
      <OrganizationDrawer id={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
