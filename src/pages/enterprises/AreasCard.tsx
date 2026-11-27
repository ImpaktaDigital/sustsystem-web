import { Badge, Button, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconMap2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Area, Enterprise } from '../../api/types';
import { EmptyState, Field } from '../../components/common';
import { formatHa, formatMeters } from '../../lib/geodesy';
import { MapView } from '../../map/MapView';

/** Resumo das áreas delimitadas + localização, com acesso ao editor geográfico. */
export function AreasCard({ enterprise: e }: { enterprise: Enterprise }) {
  const { data: areas = [], isLoading } = useQuery({ queryKey: ['areas', e.id], queryFn: () => api.get<Area[]>(`/enterprises/${e.id}/areas`, { includeArchived: true }) });
  const active = areas.filter((a) => a.status === 'ACTIVE');
  const polygons = useMemo(
    () => active.map((a) => ({ id: a.id, geometry: a.currentVersion.geometry, color: a.areaType.color })),
    [areas], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hasPoint = e.latitude != null && e.longitude != null;

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={5}>Áreas e localização</Title>
        <Button component={Link} to={`/empreendimentos/${e.id}/editor`} size="xs" leftSection={<IconMap2 size={14} />}>
          Abrir editor geográfico
        </Button>
      </Group>
      {hasPoint || active.length ? (
        !isLoading && (
          <MapView
            height={320}
            initialBasemap="satellite"
            selected={hasPoint ? { latitude: e.latitude!, longitude: e.longitude! } : null}
            polygons={polygons}
          />
        )
      ) : (
        <EmptyState>Sem localização nem áreas delimitadas.</EmptyState>
      )}

      {active.length > 0 && (
        <Table fz="xs" mt="sm" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr><Table.Th>Área</Table.Th><Table.Th ta="right">Superfície / perímetro</Table.Th><Table.Th>Versão</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {active.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <span className="area-swatch" style={{ background: a.areaType.color }} />
                    <div>
                      <Text fz="xs" fw={600}>{a.name}</Text>
                      <Text fz={10} c="dimmed">{a.areaType.name}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                  <Text fz="xs" ff="monospace">{formatHa(a.currentVersion.areaM2)}</Text>
                  <Text fz={10} c="dimmed" ff="monospace">{formatMeters(a.currentVersion.perimeterM)}</Text>
                </Table.Td>
                <Table.Td>
                  <Stack gap={2} align="flex-start">
                    <Badge size="xs" variant="light" color="gray">V{a.currentVersion.version}</Badge>
                    {a.validatedVersion != null && <Badge size="xs" variant="light" color="forest" title="Última versão validada">✓ V{a.validatedVersion}</Badge>}
                  </Stack>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {!isLoading && !active.length && <Text fz="sm" c="dimmed" mt="sm">Nenhuma área delimitada ainda. Use o editor geográfico para desenhar, importar ou colar coordenadas.</Text>}

      {hasPoint && (
        <Stack gap={4} mt="sm">
          <SimpleGrid cols={2}>
            <Field label="Latitude">{e.latitude?.toFixed(7)}</Field>
            <Field label="Longitude">{e.longitude?.toFixed(7)}</Field>
          </SimpleGrid>
          {e.utmZone && <Text fz="xs" c="dimmed">{e.utmZone.label} (EPSG:{e.utmZone.epsg})</Text>}
        </Stack>
      )}
    </Card>
  );
}
