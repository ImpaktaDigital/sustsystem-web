import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { axisLabels, crsLabel, parseCoordinateList, type Crs } from '../../lib/crs';
import { formatHa, polygonMetrics, type LngLat } from '../../lib/geodesy';
import { CrsSelect } from './CrsSelect';

interface Props {
  opened: boolean;
  onClose: () => void;
  crs: Crs;
  title: string;
  onApply: (points: LngLat[], crs: Crs) => void;
}

/** Entrada de vértices por lista de coordenadas (levantamento topográfico, memorial, planilha). */
export function PasteCoordinatesModal({ opened, onClose, crs: initialCrs, title, onApply }: Props) {
  const [text, setText] = useState('');
  const [crs, setCrs] = useState(initialCrs);
  useEffect(() => { if (opened) { setText(''); setCrs(initialCrs); } }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseCoordinateList(text, crs), [text, crs]);
  const metrics = parsed.points.length >= 3 ? polygonMetrics(parsed.points) : null;
  const [a, b] = axisLabels(crs);
  const example = crs.kind === 'utm' ? 'V1\t290512,35\t7465210,80\nV2\t290610,12\t7465198,44\nV3\t290598,90\t7465101,05' : crs.kind === 'dms' ? `22°54'20,1"S\t47°03'38,9"W` : '-22,905600\t-47,060800\n-22,905600\t-47,059800';

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <Stack>
        <CrsSelect value={crs} onChange={setCrs} label="Sistema das coordenadas coladas" />
        <Textarea
          label={`Uma linha por vértice: ${a} e ${b}`}
          description="Separe por tabulação (colado do Excel), ponto e vírgula ou espaço. Uma coluna inicial com o nome do vértice é ignorada. Vírgula decimal é aceita."
          placeholder={example}
          autosize
          minRows={8}
          maxRows={16}
          ff="monospace"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        {!!parsed.errors.length && (
          <Alert color="yellow" variant="light">Linha(s) não reconhecida(s): {parsed.errors.slice(0, 15).join(', ')}{parsed.errors.length > 15 ? '…' : ''}. Confira o sistema de coordenadas.</Alert>
        )}
        <Text fz="sm">
          {parsed.points.length} vértice(s) reconhecido(s){metrics ? ` · área ${formatHa(metrics.areaM2)}` : ''} · {crsLabel(crs)}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button disabled={parsed.points.length < 3} onClick={() => { onApply(parsed.points, crs); onClose(); }}>Usar {parsed.points.length} vértices</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
