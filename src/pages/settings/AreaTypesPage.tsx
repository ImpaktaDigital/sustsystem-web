import { ActionIcon, Button, Card, ColorInput, Group, Menu, Modal, NumberInput, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconDots, IconPencil, IconPlus, IconToggleLeft, IconToggleRight } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AreaType } from '../../api/types';
import { LoadingBlock, PageHeader, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';

const SWATCHES = ['#facc15', '#f97316', '#16a34a', '#0d9488', '#a16207', '#4d7c0f', '#0284c7', '#dc2626', '#7c3aed', '#78716c', '#db2777', '#1e293b'];

interface FormState {
  name: string;
  color: string;
  description: string;
  sortOrder: number | '';
}

function TypeModal({ type, opened, onClose }: { type: AreaType | null; opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ name: '', color: '#16a34a', description: '', sortOrder: '' });
  useEffect(() => {
    if (opened) setForm(type ? { name: type.name, color: type.color, description: type.description ?? '', sortOrder: type.sortOrder } : { name: '', color: '#16a34a', description: '', sortOrder: '' });
  }, [opened, type]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), color: form.color, description: form.description.trim() || (type ? null : undefined), sortOrder: form.sortOrder === '' ? undefined : form.sortOrder };
      return type ? api.patch(`/area-types/${type.id}`, body) : api.post('/area-types', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['area-types'] });
      notifySuccess(type ? 'Tipo de área atualizado' : 'Tipo de área criado');
      onClose();
    },
    onError: (e) => notifyError(e),
  });

  const validColor = /^#[0-9a-fA-F]{6}$/.test(form.color);
  return (
    <Modal opened={opened} onClose={onClose} title={type ? 'Editar tipo de área' : 'Novo tipo de área'}>
      <Stack>
        <TextInput label="Nome" withAsterisk data-autofocus value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        <ColorInput label="Cor no mapa e na legenda" withAsterisk format="hex" swatches={SWATCHES} value={form.color} onChange={(color) => setForm({ ...form, color })} error={!validColor && 'Cor no formato #RRGGBB'} />
        <Textarea label="Descrição" autosize minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
        <NumberInput label="Ordem" description="Ordem nas camadas e na legenda (menor primeiro)" min={0} max={9999} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v === '' ? '' : Number(v) })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.name.trim().length < 2 || !validColor}>Salvar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Tipos de área configuráveis da organização (camadas do editor e legenda da planta). */
export function AreaTypesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AreaType | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['area-types', 'all'], queryFn: () => api.get<AreaType[]>('/area-types', { includeInactive: true }) });

  const toggle = useMutation({
    mutationFn: (t: AreaType) => api.post(`/area-types/${t.id}/${t.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: (_r, t) => {
      queryClient.invalidateQueries({ queryKey: ['area-types'] });
      notifySuccess(t.status === 'ACTIVE' ? 'Tipo desativado (áreas existentes são mantidas)' : 'Tipo reativado');
    },
    onError: (e) => notifyError(e),
  });

  return (
    <>
      <PageHeader
        title="Tipos de área"
        description="Categorias usadas para delimitar áreas no editor geográfico (camadas, cores e legenda da planta)"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Novo tipo</Button>}
      />
      <Card withBorder padding={0}>
        {isLoading ? <LoadingBlock /> : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Tipo</Table.Th><Table.Th>Descrição</Table.Th><Table.Th ta="right">Áreas</Table.Th><Table.Th>Situação</Table.Th><Table.Th w={50} /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <span className="area-swatch" style={{ background: t.color, width: 16, height: 16 }} />
                        <Text fz="sm" fw={600}>{t.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td><Text fz="sm" c="dimmed">{t.description}</Text></Table.Td>
                    <Table.Td ta="right"><Text fz="sm">{t.areaCount ?? 0}</Text></Table.Td>
                    <Table.Td><StatusBadge status={t.status} /></Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" aria-label={`Ações para ${t.name}`}><IconDots size={16} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => { setEditing(t); setOpen(true); }}>Editar</Menu.Item>
                          <Menu.Item leftSection={t.status === 'ACTIVE' ? <IconToggleLeft size={14} /> : <IconToggleRight size={14} />} onClick={() => toggle.mutate(t)}>
                            {t.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <TypeModal type={editing} opened={open} onClose={() => setOpen(false)} />
    </>
  );
}
