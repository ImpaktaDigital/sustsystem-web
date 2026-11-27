import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconArrowBackUp, IconCircleCheck, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { SOURCE_METHOD_LABELS, type Area, type AreaVersion } from '../../api/types';
import { LoadingBlock } from '../../components/common';
import { formatHa, formatMeters, formatM2 } from '../../lib/geodesy';
import { formatDateTime } from '../../lib/masks';

interface Props {
  area: Area;
  compareId: string | null;
  onCompare: (version: AreaVersion | null) => void;
  canValidate: boolean;
  canWrite: boolean;
  busy: boolean;
  onValidate: (version: number) => void;
  onRestore: (version: AreaVersion) => void;
}

/** Histórico de versões da área (US55, seção 9.2): V1 coleta original, V2 ajuste, V3 revisão técnica... */
export function VersionsPanel({ area, compareId, onCompare, canValidate, canWrite, busy, onValidate, onRestore }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['area-versions', area.id, area.currentVersion.version, area.validatedVersion],
    queryFn: () => api.get<AreaVersion[]>(`/areas/${area.id}/versions`),
  });
  if (isLoading || !data) return <LoadingBlock />;

  return (
    <Stack gap="sm">
      <Text fz="xs" c="dimmed">
        As versões nunca são sobrescritas. A última versão <b>validada</b> é a usada na planta; a versão atual pode estar em ajuste.
      </Text>
      {data.map((v) => {
        const current = v.version === area.currentVersion.version;
        const diff = v.areaM2 - area.currentVersion.areaM2;
        return (
          <Card key={v.id} withBorder padding="sm" bg={compareId === v.id ? 'var(--mantine-color-gray-light)' : undefined}>
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Group gap={6}>
                <Text fw={700}>V{v.version}</Text>
                {current && <Badge size="xs" variant="light">Atual</Badge>}
                {v.validatedAt && <Badge size="xs" color="forest" leftSection={<IconCircleCheck size={10} />}>Validada</Badge>}
              </Group>
              <Text fz="xs" c="dimmed">{formatDateTime(v.createdAt)}</Text>
            </Group>
            <Text fz="xs">{SOURCE_METHOD_LABELS[v.sourceMethod]}{v.coordinateSystem ? ` · ${v.coordinateSystem}` : ''} · {v.createdBy?.name ?? '—'}</Text>
            <Text fz="xs" ff="monospace">
              {formatM2(v.areaM2)} ({formatHa(v.areaM2)}) · perímetro {formatMeters(v.perimeterM)} · {v.vertexCount} vértices
            </Text>
            {!current && Math.abs(diff) >= 0.01 && (
              <Text fz="xs" c={diff > 0 ? 'red' : 'forest'}>{diff > 0 ? '+' : ''}{formatM2(diff)} em relação à atual</Text>
            )}
            {v.notes && <Text fz="xs" c="dimmed" mt={2} style={{ whiteSpace: 'pre-wrap' }}>“{v.notes}”</Text>}
            {v.validatedAt && <Text fz="xs" c="forest.8" mt={2}>Validada por {v.validatedBy?.name ?? '—'} em {formatDateTime(v.validatedAt)}</Text>}
            <Group gap={6} mt={6}>
              {!current && (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="gray"
                  leftSection={compareId === v.id ? <IconEyeOff size={12} /> : <IconEye size={12} />}
                  onClick={() => onCompare(compareId === v.id ? null : v)}
                >
                  {compareId === v.id ? 'Ocultar comparação' : 'Comparar no mapa'}
                </Button>
              )}
              {canValidate && !v.validatedAt && (
                <Button size="compact-xs" variant="light" color="forest" leftSection={<IconCircleCheck size={12} />} loading={busy} onClick={() => onValidate(v.version)}>
                  Validar V{v.version}
                </Button>
              )}
              {canWrite && !current && area.status === 'ACTIVE' && (
                <Button size="compact-xs" variant="subtle" leftSection={<IconArrowBackUp size={12} />} onClick={() => onRestore(v)}>
                  Restaurar como nova versão
                </Button>
              )}
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
