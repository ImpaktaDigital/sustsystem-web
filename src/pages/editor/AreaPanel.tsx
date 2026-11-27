import { Alert, Badge, Button, Divider, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconCircleCheck, IconClipboardText, IconCopy, IconDeviceFloppy, IconPencil, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { SOURCE_METHOD_LABELS, type Area, type AreaType } from '../../api/types';
import { notifySuccess } from '../../components/notify';
import { axisLabels, crsLabel, type Crs } from '../../lib/crs';
import { formatHa, formatM2, formatMeters, lineLength, polygonMetrics, type LngLat } from '../../lib/geodesy';
import { formatDateTime } from '../../lib/masks';
import { vertexRows, VertexTable } from './VertexTable';

export interface NewAreaForm {
  name: string;
  areaTypeId: string | null;
  notes: string;
}

interface Props {
  area: Area | null;
  isNew: boolean;
  editing: boolean;
  dirty: boolean;
  ring: LngLat[];
  closed: boolean;
  crs: Crs;
  types: AreaType[];
  newArea: NewAreaForm;
  onNewAreaChange: (v: NewAreaForm) => void;
  versionNotes: string;
  onVersionNotes: (v: string) => void;
  canWrite: boolean;
  canValidate: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onUpdateProps: (patch: { name?: string; areaTypeId?: string; notes?: string | null }) => void;
  onValidate: (version: number) => void;
  onArchive: (archive: boolean) => void;
  onPaste: () => void;
  selectedVertex: number | null;
  onSelectVertex: (i: number) => void;
  onMoveVertex: (i: number, p: LngLat) => void;
  onInsertAfter: (i: number) => void;
  onRemoveVertex: (i: number) => void;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <Text fz={10} c="dimmed" tt="uppercase" fw={700}>{label}</Text>
      <Text fz="sm" fw={600} ff="monospace">{value}</Text>
      {hint && <Text fz="xs" c="dimmed" ff="monospace">{hint}</Text>}
    </div>
  );
}

/** Painel da área selecionada ou em desenho: propriedades, medidas, vértices e salvamento de versão. */
export function AreaPanel(p: Props) {
  const { area, isNew, editing, ring, closed, crs } = p;
  const [props, setProps] = useState({ name: '', areaTypeId: '', notes: '' });
  useEffect(() => {
    if (area) setProps({ name: area.name, areaTypeId: area.areaType.id, notes: area.notes ?? '' });
  }, [area]);

  if (!area && !isNew) {
    return <Text fz="sm" c="dimmed">Selecione uma área no mapa ou na aba Camadas, ou comece uma <b>Nova área</b>.</Text>;
  }

  const metrics = ring.length >= 3 && closed ? polygonMetrics(ring) : null;
  const typeOptions = p.types.map((t) => ({ value: t.id, label: t.name }));
  // Tipo atual pode estar inativo: mantém na lista para exibição
  if (area && !typeOptions.some((o) => o.value === area.areaType.id)) typeOptions.push({ value: area.areaType.id, label: `${area.areaType.name} (inativo)` });
  const propsChanged = !!area && (props.name.trim() !== area.name || props.areaTypeId !== area.areaType.id || props.notes.trim() !== (area.notes ?? ''));
  const archived = area?.status === 'INACTIVE';
  const nextVersion = area ? area.currentVersion.version + 1 : 1;

  const copyTable = async () => {
    const [a, b] = axisLabels(crs);
    const lines = [`Vértice\t${a}\t${b}\tLado (m)\tAzimute`, ...vertexRows(ring, crs, closed).map((r) => [r.label, r.a, r.b, r.side, r.azimuth].join('\t'))];
    await navigator.clipboard.writeText(`${crsLabel(crs)}\n${lines.join('\n')}`);
    notifySuccess('Tabela de vértices copiada (cole no Excel ou no memorial)');
  };

  return (
    <Stack gap="sm">
      {area && (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap={6}>
              <span className="area-swatch" style={{ background: area.areaType.color }} />
              <Text fw={700}>{area.name}</Text>
            </Group>
            <Text fz="xs" c="dimmed">{area.areaType.name}</Text>
          </div>
          <Group gap={4}>
            <Badge variant="light" color="gray">V{area.currentVersion.version}</Badge>
            {area.validatedVersion != null && <Badge variant="light" color="forest">Validada V{area.validatedVersion}</Badge>}
            {archived && <Badge variant="light" color="red">Arquivada</Badge>}
          </Group>
        </Group>
      )}
      {isNew && <Text fw={700}>Nova área</Text>}

      <SimpleGrid cols={3} spacing="xs">
        {metrics ? (
          <>
            <Metric label="Área" value={formatHa(metrics.areaM2)} hint={formatM2(metrics.areaM2)} />
            <Metric label="Perímetro" value={formatMeters(metrics.perimeterM)} />
            <Metric label="Vértices" value={String(ring.length)} />
          </>
        ) : (
          <>
            <Metric label="Comprimento" value={formatMeters(lineLength(ring))} />
            <Metric label="Vértices" value={String(ring.length)} />
          </>
        )}
      </SimpleGrid>
      {area && !editing && (
        <Text fz="xs" c="dimmed">
          {SOURCE_METHOD_LABELS[area.currentVersion.sourceMethod]} · {area.currentVersion.createdBy?.name ?? '—'} · {formatDateTime(area.currentVersion.createdAt)}
        </Text>
      )}

      {/* Dados da nova área */}
      {isNew && (
        <Stack gap="xs">
          <Select label="Tipo de área" withAsterisk data={typeOptions} value={p.newArea.areaTypeId} onChange={(v) => p.onNewAreaChange({ ...p.newArea, areaTypeId: v })} searchable allowDeselect={false} />
          <TextInput label="Nome da área" withAsterisk placeholder="Ex.: Perímetro do imóvel, APP do córrego" value={p.newArea.name} onChange={(e) => p.onNewAreaChange({ ...p.newArea, name: e.currentTarget.value })} />
          <Textarea label="Observações" autosize minRows={1} value={p.newArea.notes} onChange={(e) => p.onNewAreaChange({ ...p.newArea, notes: e.currentTarget.value })} />
        </Stack>
      )}

      {/* Dados da área existente */}
      {area && !editing && p.canWrite && !archived && (
        <Stack gap="xs">
          <Select label="Tipo de área" size="xs" data={typeOptions} value={props.areaTypeId} onChange={(v) => v && setProps({ ...props, areaTypeId: v })} searchable allowDeselect={false} />
          <TextInput label="Nome" size="xs" value={props.name} onChange={(e) => setProps({ ...props, name: e.currentTarget.value })} />
          <Textarea label="Observações" size="xs" autosize minRows={1} value={props.notes} onChange={(e) => setProps({ ...props, notes: e.currentTarget.value })} />
          {propsChanged && (
            <Group justify="flex-end">
              <Button size="xs" variant="default" onClick={() => setProps({ name: area.name, areaTypeId: area.areaType.id, notes: area.notes ?? '' })}>Desfazer</Button>
              <Button size="xs" disabled={!props.name.trim()} onClick={() => p.onUpdateProps({ name: props.name.trim(), areaTypeId: props.areaTypeId, notes: props.notes.trim() || null })}>Salvar dados</Button>
            </Group>
          )}
        </Stack>
      )}
      {area && !editing && (!p.canWrite || archived) && area.notes && <Text fz="sm" style={{ whiteSpace: 'pre-wrap' }}>{area.notes}</Text>}

      {/* Ações */}
      {area && !editing && (
        <Group gap="xs">
          {p.canWrite && !archived && <Button size="xs" leftSection={<IconPencil size={14} />} onClick={p.onStartEdit}>Editar vértices</Button>}
          {p.canValidate && !area.currentVersion.validatedAt && !archived && (
            <Tooltip label="Registrar a revisão técnica desta versão; a versão validada alimenta a planta">
              <Button size="xs" variant="light" color="forest" leftSection={<IconCircleCheck size={14} />} onClick={() => p.onValidate(area.currentVersion.version)}>
                Validar V{area.currentVersion.version}
              </Button>
            </Tooltip>
          )}
          {p.canWrite && (
            <Button size="xs" variant="subtle" color={archived ? 'gray' : 'red'} leftSection={archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />} onClick={() => p.onArchive(!archived)}>
              {archived ? 'Restaurar' : 'Arquivar'}
            </Button>
          )}
        </Group>
      )}

      <Divider label="Vértices" labelPosition="left" />
      <Group justify="space-between">
        <Text fz="xs" c="dimmed">{crsLabel(crs)}</Text>
        <Group gap={4}>
          {editing && <Button size="compact-xs" variant="subtle" leftSection={<IconClipboardText size={12} />} onClick={p.onPaste}>Colar coordenadas</Button>}
          {ring.length > 0 && <Button size="compact-xs" variant="subtle" leftSection={<IconCopy size={12} />} onClick={copyTable}>Copiar tabela</Button>}
        </Group>
      </Group>
      <VertexTable
        ring={ring}
        crs={crs}
        closed={closed}
        editable={editing && closed}
        selectedVertex={p.selectedVertex}
        onSelect={p.onSelectVertex}
        onMove={p.onMoveVertex}
        onInsertAfter={p.onInsertAfter}
        onRemove={p.onRemoveVertex}
      />

      {/* Salvamento */}
      {editing && (
        <Stack gap="xs" mt="xs">
          {!closed && ring.length > 0 && <Alert variant="light" color="slateBlue" p="xs" fz="xs">Feche o polígono para salvar: clique no vértice 1, dê duplo clique ou tecle Enter.</Alert>}
          <Textarea
            label={isNew ? 'Observações da versão V1' : `Observações da versão V${nextVersion}`}
            description={isNew ? 'Ex.: origem do levantamento, equipamento, precisão' : 'Ex.: motivo do ajuste, revisão técnica'}
            size="xs"
            autosize
            minRows={1}
            value={p.versionNotes}
            onChange={(e) => p.onVersionNotes(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button size="xs" variant="default" leftSection={<IconX size={14} />} onClick={p.onCancel}>Cancelar</Button>
            <Button
              size="xs"
              leftSection={<IconDeviceFloppy size={14} />}
              loading={p.saving}
              disabled={!closed || ring.length < 3 || (!isNew && !p.dirty) || (isNew && (!p.newArea.name.trim() || !p.newArea.areaTypeId))}
              onClick={p.onSave}
            >
              {isNew ? 'Salvar área (V1)' : `Salvar como V${nextVersion}`}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
