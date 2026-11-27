import { ActionIcon, Badge, Group, Stack, Switch, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import type { Area, MapElement } from '../../api/types';
import { SymbolIcon } from './ElementPanel';
import { formatHa } from '../../lib/geodesy';

interface Props {
  areas: Area[];
  hiddenTypes: Set<string>;
  onToggleType: (typeId: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
  elements: MapElement[];
  hiddenElementTypes: Set<string>;
  onToggleElementType: (typeId: string) => void;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
}

/** Camadas por tipo de área (US51): visibilidade, totais e lista das áreas. */
export function LayersPanel({
  areas, hiddenTypes, onToggleType, selectedId, onSelect, showArchived, onShowArchived,
  elements, hiddenElementTypes, onToggleElementType, selectedElementId, onSelectElement,
}: Props) {
  const elementGroups = new Map<string, { type: MapElement['elementType']; items: MapElement[] }>();
  for (const e of elements) {
    const g = elementGroups.get(e.elementTypeId) ?? { type: e.elementType, items: [] };
    g.items.push(e);
    elementGroups.set(e.elementTypeId, g);
  }
  const groups = new Map<string, { name: string; color: string; areas: Area[] }>();
  for (const a of areas) {
    const g = groups.get(a.areaType.id) ?? { name: a.areaType.name, color: a.areaType.color, areas: [] };
    g.areas.push(a);
    groups.set(a.areaType.id, g);
  }

  return (
    <Stack gap="md">
      {!groups.size && !elementGroups.size && (
        <Text fz="sm" c="dimmed">
          Nenhuma área delimitada. Use <b>Nova área</b> para desenhar no mapa, <b>Importar</b> para trazer um arquivo (GeoJSON, KML, KMZ, Shapefile) ou <b>Colar coordenadas</b> de um levantamento.
        </Text>
      )}
      {[...groups.entries()].map(([typeId, g]) => {
        const hidden = hiddenTypes.has(typeId);
        const total = g.areas.filter((a) => a.status === 'ACTIVE').reduce((s, a) => s + a.currentVersion.areaM2, 0);
        return (
          <Stack key={typeId} gap={4}>
            <Group gap={8} wrap="nowrap">
              <Tooltip label={hidden ? 'Mostrar camada' : 'Ocultar camada'}>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onToggleType(typeId)} aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} ${g.name}`}>
                  {hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </ActionIcon>
              </Tooltip>
              <span className="area-swatch" style={{ background: g.color }} />
              <Text fz="sm" fw={600} style={{ flex: 1 }} opacity={hidden ? 0.5 : 1} lineClamp={1}>{g.name}</Text>
              <Text fz="xs" c="dimmed" ff="monospace">{formatHa(total)}</Text>
            </Group>
            {g.areas.map((a) => (
              <UnstyledButton
                key={a.id}
                onClick={() => onSelect(a.id)}
                pl={34}
                pr={6}
                py={4}
                style={{ borderRadius: 6, background: a.id === selectedId ? 'var(--mantine-color-orange-light)' : undefined }}
                aria-label={`Área ${a.name}`}
              >
                <Group gap={6} wrap="nowrap">
                  <Text fz="sm" style={{ flex: 1 }} lineClamp={1} td={a.status === 'INACTIVE' ? 'line-through' : undefined}>{a.name}</Text>
                  <Badge size="xs" variant="light" color="gray">V{a.currentVersion.version}</Badge>
                  {a.validatedVersion != null && <Tooltip label={`Versão validada: V${a.validatedVersion}`}><Badge size="xs" variant="light" color="forest">✓ V{a.validatedVersion}</Badge></Tooltip>}
                </Group>
                <Text fz="xs" c="dimmed" ff="monospace">{formatHa(a.currentVersion.areaM2)}</Text>
              </UnstyledButton>
            ))}
          </Stack>
        );
      })}
      {elementGroups.size > 0 && <Text fz="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">Elementos pontuais</Text>}
      {[...elementGroups.entries()].map(([typeId, g]) => {
        const hidden = hiddenElementTypes.has(typeId);
        return (
          <Stack key={typeId} gap={4}>
            <Group gap={8} wrap="nowrap">
              <Tooltip label={hidden ? 'Mostrar camada' : 'Ocultar camada'}>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onToggleElementType(typeId)} aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} ${g.type.name}`}>
                  {hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </ActionIcon>
              </Tooltip>
              <SymbolIcon type={g.type} size={16} />
              <Text fz="sm" fw={600} style={{ flex: 1 }} opacity={hidden ? 0.5 : 1} lineClamp={1}>{g.type.name}</Text>
              <Text fz="xs" c="dimmed">{g.items.length}</Text>
            </Group>
            {g.items.map((e) => (
              <UnstyledButton key={e.id} onClick={() => onSelectElement(e.id)} pl={34} pr={6} py={2} aria-label={`Elemento ${e.name}`}
                style={{ borderRadius: 6, background: e.id === selectedElementId ? 'var(--mantine-color-orange-light)' : undefined }}>
                <Text fz="sm" lineClamp={1} td={e.status === 'INACTIVE' ? 'line-through' : undefined}>
                  {e.name}{e.specification ? <Text span c="dimmed" fz="xs"> · {e.specification}</Text> : null}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        );
      })}
      <Switch size="xs" label="Mostrar arquivados" checked={showArchived} onChange={(e) => onShowArchived(e.currentTarget.checked)} />
    </Stack>
  );
}
