import { zodResolver } from '@hookform/resolvers/zod';
import { ActionIcon, Alert, Button, Card, Group, Menu, Modal, Pagination, PasswordInput, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconDots, IconMailForward, IconPencil, IconPlus, IconSearch, IconTrash, IconUserOff, IconUserCheck } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Member, Paginated } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, LoadingBlock, PageHeader, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatDateTime } from '../../lib/masks';
import { ROLE_LABELS, ROLES } from '../../lib/shared';
import { PASSWORD_HINT, passwordSchema } from '../auth/passwordRules';

const PAGE_SIZE = 20;
const roleOptions = ROLES.filter((r) => r !== 'CLIENT').map((r) => ({ value: r, label: ROLE_LABELS[r] }));

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome'),
  email: z.string().trim().email('E-mail inválido'),
  role: z.string().min(1, 'Selecione o perfil'),
  password: passwordSchema.optional().or(z.literal('')),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, reset, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', email: '', role: 'FIELD_TECH', password: '' },
  });
  useEffect(() => { if (opened) reset(); }, [opened, reset]);

  const save = useMutation({
    mutationFn: (v: InviteValues) => api.post<Member>('/users', { ...v, password: v.password || undefined }),
    onSuccess: (_m, v) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notifySuccess(v.password ? 'Usuário cadastrado' : `Convite enviado para ${v.email}`);
      onClose();
    },
    onError: (e) => notifyError(e),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Adicionar membro à equipe">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Stack>
          <TextInput label="Nome" withAsterisk data-autofocus {...register('name')} error={formState.errors.name?.message} />
          <TextInput label="E-mail" type="email" withAsterisk {...register('email')} error={formState.errors.email?.message} />
          <Controller control={control} name="role" render={({ field }) => <Select label="Perfil" withAsterisk data={roleOptions} {...field} error={formState.errors.role?.message} />} />
          <PasswordInput
            label="Senha inicial"
            description={`Opcional. Sem senha, a pessoa recebe um convite por e-mail para definir a própria senha. ${PASSWORD_HINT}.`}
            autoComplete="new-password"
            {...register('password')}
            error={formState.errors.password?.message}
          />
          <Alert variant="light" color="slateBlue" fz="sm">Se o e-mail já tiver conta no SustSystem, a pessoa apenas ganha acesso a esta organização.</Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>Adicionar</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function EditModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { if (member) { setName(member.name); setRole(member.role); } }, [member]);

  const save = useMutation({
    mutationFn: () => api.patch(`/users/${member!.id}`, { name, role }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); notifySuccess('Usuário atualizado'); onClose(); },
    onError: (e) => notifyError(e),
  });

  return (
    <Modal opened={!!member} onClose={onClose} title="Editar membro">
      <Stack>
        <TextInput label="Nome" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Select label="Perfil" data={roleOptions} value={role} onChange={setRole} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2 || !role}>Salvar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Gestão da equipe: membros, perfis, convites e desativação (RF04, US03–US05, US08). */
export function UsersPage() {
  const { can, me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [debounced] = useDebouncedValue(search, 300);
  const manage = can('users.manage');

  const { data, isLoading } = useQuery({
    queryKey: ['users', { search: debounced, role, page }],
    queryFn: () => api.get<Paginated<Member>>('/users', { search: debounced, role, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const action = useMutation({
    mutationFn: ({ member, op }: { member: Member; op: 'deactivate' | 'activate' | 'resend-invitation' }) => api.post(`/users/${member.id}/${op}`),
    onSuccess: (_r, { member, op }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notifySuccess(op === 'resend-invitation' ? `Convite reenviado para ${member.email}` : op === 'deactivate' ? 'Acesso desativado' : 'Acesso reativado');
    },
    onError: (e) => notifyError(e),
  });

  const confirmDeactivate = (member: Member) =>
    modals.openConfirmModal({
      title: 'Desativar acesso',
      children: <Text fz="sm"><b>{member.name}</b> perderá o acesso a esta organização imediatamente. O histórico é preservado.</Text>,
      labels: { confirm: 'Desativar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => action.mutate({ member, op: 'deactivate' }),
    });

  const remove = useMutation({
    mutationFn: (member: Member) => api.delete(`/users/${member.id}`),
    onSuccess: (_r, member) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notifySuccess(`${member.name} foi excluído(a) da organização`);
    },
    onError: (e) => notifyError(e),
  });

  const confirmDelete = (member: Member) =>
    modals.openConfirmModal({
      title: 'Excluir usuário',
      children: (
        <Stack gap="xs">
          <Text fz="sm"><b>{member.name}</b> ({member.email}) será removido(a) da organização de forma definitiva.</Text>
          <Text fz="sm" c="dimmed">A exclusão só é permitida porque este usuário ainda não fez nenhum registro. Atribuições a empreendimentos também serão removidas.</Text>
        </Stack>
      ),
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(member),
    });

  return (
    <>
      <PageHeader
        title="Equipe e usuários"
        description="Membros da organização e seus perfis de acesso"
        actions={manage && <Button leftSection={<IconPlus size={16} />} onClick={() => setInviting(true)}>Adicionar membro</Button>}
      />
      <Card withBorder padding={0}>
        <Group p="md" gap="sm">
          <TextInput
            placeholder="Buscar por nome ou e-mail"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            style={{ flex: 1, minWidth: 220 }}
            aria-label="Buscar usuários"
          />
          <Select placeholder="Perfil" clearable data={roleOptions} value={role} onChange={(v) => { setRole(v); setPage(1); }} w={240} aria-label="Filtrar por perfil" />
        </Group>
        {isLoading ? <LoadingBlock /> : !data?.items.length ? <EmptyState>Nenhum membro encontrado.</EmptyState> : (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Nome</Table.Th><Table.Th>Perfil</Table.Th><Table.Th>Último acesso</Table.Th><Table.Th>Situação</Table.Th>{manage && <Table.Th w={50} />}</Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td>
                      <Text fz="sm" fw={600}>{m.name}{m.id === me?.user.id && <Text span c="dimmed" fz="xs"> (você)</Text>}</Text>
                      <Text fz="xs" c="dimmed">{m.email}</Text>
                    </Table.Td>
                    <Table.Td><Text fz="sm">{m.roleLabel}</Text></Table.Td>
                    <Table.Td><Text fz="sm">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : <Text span c="dimmed" fz="sm">Nunca acessou</Text>}</Text></Table.Td>
                    <Table.Td><StatusBadge status={m.status} /></Table.Td>
                    {manage && (
                      <Table.Td>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target><ActionIcon variant="subtle" aria-label={`Ações para ${m.name}`}><IconDots size={16} /></ActionIcon></Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(m)}>Editar</Menu.Item>
                            {!m.lastLoginAt && m.status === 'ACTIVE' && (
                              <Menu.Item leftSection={<IconMailForward size={14} />} onClick={() => action.mutate({ member: m, op: 'resend-invitation' })}>Reenviar convite</Menu.Item>
                            )}
                            {m.id !== me?.user.id && (m.status === 'ACTIVE' ? (
                              <Menu.Item color="red" leftSection={<IconUserOff size={14} />} onClick={() => confirmDeactivate(m)}>Desativar acesso</Menu.Item>
                            ) : (
                              <Menu.Item leftSection={<IconUserCheck size={14} />} onClick={() => action.mutate({ member: m, op: 'activate' })}>Reativar acesso</Menu.Item>
                            ))}
                            {m.id !== me?.user.id && (m.canDelete ? (
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(m)}>Excluir usuário</Menu.Item>
                            ) : (
                              <Menu.Item disabled leftSection={<IconTrash size={14} />}>
                                Excluir usuário
                                <Text fz="xs" c="dimmed">Possui {m.activityCount} registro(s): apenas inativar</Text>
                              </Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    )}
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
      <InviteModal opened={inviting} onClose={() => setInviting(false)} />
      <EditModal member={editing} onClose={() => setEditing(null)} />
    </>
  );
}
