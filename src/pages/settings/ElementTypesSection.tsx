import { ActionIcon, Button, Card, ColorInput, Group, Menu, Modal, NumberInput, Select, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconDots, IconPencil, IconPlus, IconToggleLeft, IconToggleRight } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { ElementType, SymbolShape } from '../../api/types';
import { LoadingBlock, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { SHAPE_LABELS } from '../../lib/symbols';
import { SymbolIcon } from '../editor/ElementPanel';

const SWATCHES = ['#dc2626', '#b91c1c', '#1d4ed8', '#0284c7', '#0891b2', '#16a34a', '#a16207', '#7c2d12', '#7c3aed', '#1e293b', '#db2777', '#f97316'];

interface FormState { name: string; shape: SymbolShape; code: string; color: string; description: string; sortOrder: number | '' }
const EMPTY: FormState = { name: '', shape: 'CIRCLE', code: '', color: '#1d4ed8', description: '', sortOrder: '' };

function TypeModal({ type, opened, onClose }: { type: ElementType | null; opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => {
    if (opened) setForm(type ? { name: type.name, shape: type.shape, code: type.code, color: type.color, description: type.description ?? '', sortOrder: type.sortOrder } : EMPTY);
  }, [opened, type]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(), shape: form.shape, code: form.code.trim().toUpperCase(), color: form.color,
        description: form.description.trim() || (type ? null : undefined), sortOrder: form.sortOrder === '' ? undefined : form.sortOrder,
      };
      return type ? api.patch(`/element-types/${type.id}`, body) : api.post('/element-types', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['element-types'] });
      notifySuccess(type ? 'Tipo de elemento atualizado' : 'Tipo de elemento criado');
      onClose();
    },
    onError: (e) => notifyError(e),
  });

  const validColor = /^#[0-9a-fA-F]{6}$/.test(form.color);
  const validCode = /^[A-Za-z0-9]{1,4}$/.test(form.code.trim());
  return (
    <Modal opened={opened} onClose={onClose} title={type ? 'Editar tipo de elemento' : 'Novo tipo de elemento'}>
      <Stack>
        <TextInput label="Nome" withAsterisk data-autofocus value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        <Group grow align="flex-start">
          <Select label="Forma" data={Object.entries(SHAPE_LABELS).map(([value, label]) => ({ value, label }))} value={form.shape} onChange={(v) => v && setForm({ ...form, shape: v as SymbolShape })} allowDeselect={false} />
          <TextInput label="Sigla" description="1 a 4 caracteres" withAsterisk maxLength={4} value={form.code} onChange={(e) => setForm({ ...form, code: e.currentTarget.value.toUpperCase() })} error={form.code && !validCode && 'Só letras e números'} />
        </Group>
        <ColorInput label="Cor" withAsterisk format="hex" swatches={SWATCHES} value={form.color} onChange={(color) => setForm({ ...form, color })} error={!validColor && 'Cor no formato #RRGGBB'} />
        <Group gap="sm">
          <Text fz="sm" c="dimmed">Prévia do símbolo:</Text>
          {validCode && validColor && <SymbolIcon type={{ shape: form.shape, color: form.color, code: form.code.trim().toUpperCase() }} size={34} />}
        </Group>
        <Textarea label="Descrição" autosize minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
        <NumberInput label="Ordem" description="Ordem na legenda (menor primeiro)" min={0} max={9999} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v === '' ? '' : Number(v) })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.name.trim().length < 2 || !validColor || !validCode}>Salvar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Tipos de elemento pontual (símbolo = forma + sigla + cor), usados no editor e na legenda da planta. */
export function ElementTypesSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ElementType | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['element-types', 'all'], queryFn: () => api.get<ElementType[]>('/element-types', { includeInactive: true }) });

  const toggle = useMutation({
    mutationFn: (t: ElementType) => api.post(`/element-types/${t.id}/${t.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: (_r, t) => {
      queryClient.invalidateQueries({ queryKey: ['element-types'] });
      notifySuccess(t.status === 'ACTIVE' ? 'Tipo desativado (elementos existentes são mantidos)' : 'Tipo reativado');
    },
    onError: (e) => notifyError(e),
  });

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <Button leftSection={<IconPlus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Novo tipo de elemento</Button>
      </Group>
      <Card withBorder padding={0}>
        {isLoading ? <LoadingBlock /> : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Símbolo / tipo</Table.Th><Table.Th>Descrição</Table.Th><Table.Th ta="right">Elementos</Table.Th><Table.Th>Situação</Table.Th><Table.Th w={50} /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Group gap={10} wrap="nowrap">
                        <SymbolIcon type={t} size={24} />
                        <Text fz="sm" fw={600}>{t.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td><Text fz="sm" c="dimmed">{t.description}</Text></Table.Td>
                    <Table.Td ta="right"><Text fz="sm">{t.elementCount ?? 0}</Text></Table.Td>
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
