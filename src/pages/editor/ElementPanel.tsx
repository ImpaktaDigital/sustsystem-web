import { Badge, Button, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { ElementType, MapElement } from '../../api/types';
import { axisLabels, crsLabel, formatPair, parsePair, type Crs } from '../../lib/crs';
import type { LngLat } from '../../lib/geodesy';
import { formatDateTime } from '../../lib/masks';
import { symbolSvg } from '../../lib/symbols';

/** Ícone do símbolo (forma + sigla + cor) para listas e seletores. */
export function SymbolIcon({ type, size = 20 }: { type: Pick<ElementType, 'shape' | 'color' | 'code'>; size?: number }) {
  return <span style={{ display: 'inline-flex', flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: symbolSvg(type.shape, type.color, type.code, size) }} />;
}

export interface ElementForm {
  elementTypeId: string;
  name: string;
  specification: string;
  notes: string;
  position: LngLat;
}

/** Sugestão de rótulo: sigla + número sequencial do tipo (ex.: PQS-03). */
export function suggestName(type: ElementType, existing: MapElement[]) {
  const n = existing.filter((e) => e.elementTypeId === type.id).length + 1;
  return `${type.code}-${String(n).padStart(2, '0')}`;
}

interface Props {
  element: MapElement | null;
  form: ElementForm;
  onChange: (form: ElementForm) => void;
  types: ElementType[];
  crs: Crs;
  canWrite: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onArchive: (archive: boolean) => void;
}

/** Painel do elemento pontual (novo ou selecionado): tipo/símbolo, rótulo, especificação e coordenadas. */
export function ElementPanel({ element, form, onChange, types, crs, canWrite, saving, onSave, onCancel, onArchive }: Props) {
  const [coords, setCoords] = useState(() => formatPair(form.position, crs));
  const [coordError, setCoordError] = useState(false);
  useEffect(() => { setCoords(formatPair(form.position, crs)); setCoordError(false); }, [form.position, crs]);

  const isNew = !element;
  const archived = element?.status === 'INACTIVE';
  const editable = canWrite && !archived;
  const type = types.find((t) => t.id === form.elementTypeId) ?? element?.elementType;
  const typeOptions = types.map((t) => ({ value: t.id, label: t.name }));
  if (element && !typeOptions.some((o) => o.value === element.elementTypeId)) typeOptions.push({ value: element.elementTypeId, label: `${element.elementType.name} (inativo)` });
  const dirty = isNew || !!element && (
    form.elementTypeId !== element.elementTypeId || form.name.trim() !== element.name || form.specification.trim() !== (element.specification ?? '')
    || form.notes.trim() !== (element.notes ?? '') || form.position[0] !== element.longitude || form.position[1] !== element.latitude
  );

  const commitCoords = () => {
    const p = parsePair(coords[0], coords[1], crs);
    if (!p) return setCoordError(true);
    setCoordError(false);
    onChange({ ...form, position: p });
  };
  const [la, lb] = axisLabels(crs);

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          {type && <SymbolIcon type={type} size={26} />}
          <div>
            <Text fw={700}>{isNew ? 'Novo elemento' : element.name}</Text>
            <Text fz="xs" c="dimmed">{type?.name}</Text>
          </div>
        </Group>
        {archived && <Badge color="red" variant="light">Arquivado</Badge>}
      </Group>

      <Select
        label="Tipo"
        size="xs"
        data={typeOptions}
        value={form.elementTypeId}
        onChange={(v) => v && onChange({ ...form, elementTypeId: v })}
        disabled={!editable}
        searchable
        allowDeselect={false}
        renderOption={({ option }) => {
          const t = types.find((x) => x.id === option.value);
          return <Group gap={8} wrap="nowrap">{t && <SymbolIcon type={t} size={18} />}<Text fz="sm">{option.label}</Text></Group>;
        }}
      />
      <TextInput label="Rótulo" description="Aparece ao lado do símbolo na planta" size="xs" withAsterisk value={form.name} disabled={!editable} onChange={(e) => onChange({ ...form, name: e.currentTarget.value })} />
      <TextInput label="Especificação" placeholder="Ex.: PQS ABC 12 kg — 3-A:40-BC" size="xs" value={form.specification} disabled={!editable} onChange={(e) => onChange({ ...form, specification: e.currentTarget.value })} />
      <Textarea label="Observações" size="xs" autosize minRows={1} value={form.notes} disabled={!editable} onChange={(e) => onChange({ ...form, notes: e.currentTarget.value })} />

      <div>
        <Text fz="xs" fw={500} mb={2}>Coordenadas <Text span c="dimmed" fz="xs">({crsLabel(crs)})</Text></Text>
        <Group gap={6} grow>
          <TextInput size="xs" ff="monospace" aria-label={la} placeholder={la} value={coords[0]} error={coordError} disabled={!editable}
            onChange={(e) => setCoords([e.currentTarget.value, coords[1]])} onBlur={commitCoords} onKeyDown={(e) => e.key === 'Enter' && commitCoords()} />
          <TextInput size="xs" ff="monospace" aria-label={lb} placeholder={lb} value={coords[1]} error={coordError} disabled={!editable}
            onChange={(e) => setCoords([coords[0], e.currentTarget.value])} onBlur={commitCoords} onKeyDown={(e) => e.key === 'Enter' && commitCoords()} />
        </Group>
        {editable && <Text fz="xs" c="dimmed" mt={4}>Também é possível arrastar o símbolo no mapa.</Text>}
      </div>

      {element && <Text fz="xs" c="dimmed">Atualizado em {formatDateTime(element.updatedAt)}</Text>}

      {editable && (
        <Group justify="space-between">
          {element ? (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconArchive size={14} />} onClick={() => onArchive(true)}>Arquivar</Button>
          ) : <span />}
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconX size={14} />} onClick={onCancel}>{isNew ? 'Cancelar' : 'Fechar'}</Button>
            <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} loading={saving} disabled={!dirty || !form.name.trim() || coordError} onClick={onSave}>
              {isNew ? 'Salvar elemento' : 'Salvar'}
            </Button>
          </Group>
        </Group>
      )}
      {canWrite && archived && (
        <Button size="xs" variant="light" leftSection={<IconArchiveOff size={14} />} onClick={() => onArchive(false)}>Restaurar elemento</Button>
      )}
    </Stack>
  );
}
