import { ActionIcon, Group, ScrollArea, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconRowInsertBottom, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { axisLabels, formatPair, parsePair, type Crs } from '../../lib/crs';
import { segment, type LngLat } from '../../lib/geodesy';

const nf = (n: number, d: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Azimute em graus, minutos e segundos (convenção de memorial descritivo). */
export function formatAzimuth(az: number) {
  let d = Math.floor(az);
  let m = Math.floor((az - d) * 60);
  let s = Math.round(((az - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d % 360}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

/** Linhas da tabela (também usadas para copiar para planilha/memorial). */
export function vertexRows(ring: LngLat[], crs: Crs, closed: boolean) {
  return ring.map((p, i) => {
    const next = i < ring.length - 1 ? ring[i + 1] : closed && ring.length > 2 ? ring[0] : null;
    const seg = next ? segment(p, next) : null;
    const [a, b] = formatPair(p, crs);
    return { label: `V${i + 1}`, a, b, side: seg ? nf(seg.distanceM, 2) : '', azimuth: seg ? formatAzimuth(seg.azimuth) : '', to: next ? `V${i + 2 > ring.length ? 1 : i + 2}` : '' };
  });
}

function EditableRow({ point, crs, onCommit }: { point: LngLat; crs: Crs; onCommit: (p: LngLat) => void }) {
  const [values, setValues] = useState(() => formatPair(point, crs));
  const [error, setError] = useState(false);
  useEffect(() => { setValues(formatPair(point, crs)); setError(false); }, [point, crs]);

  const commit = () => {
    const parsed = parsePair(values[0], values[1], crs);
    if (!parsed) return setError(true);
    setError(false);
    if (Math.abs(parsed[0] - point[0]) > 1e-10 || Math.abs(parsed[1] - point[1]) > 1e-10) onCommit(parsed);
  };
  const [la, lb] = axisLabels(crs);
  return (
    <>
      <Table.Td p={2}>
        <TextInput size="xs" ff="monospace" aria-label={la} value={values[0]} error={error} onChange={(e) => setValues([e.currentTarget.value, values[1]])} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      </Table.Td>
      <Table.Td p={2}>
        <TextInput size="xs" ff="monospace" aria-label={lb} value={values[1]} error={error} onChange={(e) => setValues([values[0], e.currentTarget.value])} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      </Table.Td>
    </>
  );
}

interface Props {
  ring: LngLat[];
  crs: Crs;
  closed: boolean;
  editable: boolean;
  selectedVertex: number | null;
  onSelect: (index: number) => void;
  onMove: (index: number, point: LngLat) => void;
  onInsertAfter: (index: number) => void;
  onRemove: (index: number) => void;
}

/** Vértices com coordenadas no sistema escolhido, lado e azimute até o próximo vértice (US56/US57). */
export function VertexTable({ ring, crs, closed, editable, selectedVertex, onSelect, onMove, onInsertAfter, onRemove }: Props) {
  const rows = vertexRows(ring, crs, closed);
  const [la, lb] = axisLabels(crs);
  if (!ring.length) return <Text fz="sm" c="dimmed">Nenhum vértice.</Text>;
  return (
    <ScrollArea.Autosize mah={340} type="auto">
      <Table fz="xs" verticalSpacing={2} horizontalSpacing={4} highlightOnHover stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Vért.</Table.Th>
            <Table.Th>{la}</Table.Th>
            <Table.Th>{lb}</Table.Th>
            <Table.Th ta="right">Lado (m)</Table.Th>
            <Table.Th>Azimute</Table.Th>
            {editable && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ring.map((p, i) => (
            <Table.Tr
              key={i}
              bg={i === selectedVertex ? 'var(--mantine-color-orange-light)' : undefined}
              onClick={() => onSelect(i)}
              style={{ cursor: 'pointer' }}
            >
              <Table.Td fw={700}>{rows[i].label}</Table.Td>
              {editable ? (
                <EditableRow point={p} crs={crs} onCommit={(np) => onMove(i, np)} />
              ) : (
                <>
                  <Table.Td ff="monospace">{rows[i].a}</Table.Td>
                  <Table.Td ff="monospace">{rows[i].b}</Table.Td>
                </>
              )}
              <Table.Td ta="right" ff="monospace" title={rows[i].to ? `${rows[i].label} → ${rows[i].to}` : undefined}>{rows[i].side}</Table.Td>
              <Table.Td ff="monospace">{rows[i].azimuth}</Table.Td>
              {editable && (
                <Table.Td p={0}>
                  <Group gap={0} wrap="nowrap">
                    <Tooltip label="Inserir vértice depois deste">
                      <ActionIcon size="sm" variant="subtle" aria-label={`Inserir após V${i + 1}`} onClick={(e) => { e.stopPropagation(); onInsertAfter(i); }}>
                        <IconRowInsertBottom size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Remover vértice">
                      <ActionIcon size="sm" variant="subtle" color="red" disabled={ring.length <= 3 && closed} aria-label={`Remover V${i + 1}`} onClick={(e) => { e.stopPropagation(); onRemove(i); }}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
}
