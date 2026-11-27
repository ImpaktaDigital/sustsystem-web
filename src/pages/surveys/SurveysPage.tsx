import { Badge, Card, Grid, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { IconDeviceMobile, IconPhoto, IconPolygon } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { SURVEY_STATUS_LABELS, type SurveyStatus, type SurveySummary } from '../../api/types';
import { EmptyState, LoadingBlock, PageHeader } from '../../components/common';
import { formatDateTime } from '../../lib/masks';
import { MapView, type MapPoint } from '../../map/MapView';

export const SURVEY_STATUS_COLORS: Record<SurveyStatus, string> = { RECEIVED: 'orange', APPROVED: 'forest', REJECTED: 'red' };

/** Caixa de entrada dos levantamentos enviados pelo app de campo (triagem). */
export function SurveysPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SurveyStatus>('RECEIVED');
  const { data, isLoading } = useQuery({
    queryKey: ['surveys', status],
    queryFn: () => api.get<SurveySummary[]>('/surveys', { status }),
  });
  const points = useMemo<MapPoint[]>(
    () => (data ?? []).filter((s) => s.centroidLat != null).map((s) => ({
      id: s.id, latitude: s.centroidLat!, longitude: s.centroidLng!, title: s.title,
      subtitle: s.enterprise?.name ?? s.preRegistration?.clientName ?? 'Sem vínculo',
    })),
    [data],
  );

  return (
    <>
      <PageHeader
        title="Levantamentos de campo"
        description="Levantamentos enviados pelo app: confira, vincule ao cliente/empreendimento e aprove para gerar as áreas e os elementos."
      />
      <SegmentedControl
        mb="md"
        value={status}
        onChange={(v) => setStatus(v as SurveyStatus)}
        data={(['RECEIVED', 'APPROVED', 'REJECTED'] as SurveyStatus[]).map((s) => ({ value: s, label: SURVEY_STATUS_LABELS[s] }))}
      />
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder padding={0}>
            {isLoading ? <LoadingBlock /> : !data?.length ? (
              <EmptyState>{status === 'RECEIVED' ? 'Nenhum levantamento aguardando triagem.' : 'Nenhum levantamento.'}</EmptyState>
            ) : (
              <Table.ScrollContainer minWidth={720}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Levantamento</Table.Th><Table.Th>Cliente / empreendimento</Table.Th><Table.Th>Coletado por</Table.Th><Table.Th>Itens</Table.Th><Table.Th>Recebido</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.map((s) => (
                      <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/levantamentos/${s.id}`)}>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap"><IconDeviceMobile size={16} color="var(--mantine-color-dimmed)" /><Text fz="sm" fw={600}>{s.title}</Text></Group>
                          {s.preRegistration?.projectHint && <Text fz="xs" c="dimmed">Projeto: {s.preRegistration.projectHint}</Text>}
                        </Table.Td>
                        <Table.Td>
                          {s.enterprise ? (
                            <Text fz="sm">{s.enterprise.name}</Text>
                          ) : (
                            <>
                              <Badge size="xs" variant="light" color="orange">Pré-cadastro</Badge>
                              <Text fz="sm">{[s.preRegistration?.clientName, s.preRegistration?.enterpriseName].filter(Boolean).join(' — ') || '—'}</Text>
                            </>
                          )}
                        </Table.Td>
                        <Table.Td><Text fz="sm">{s.collectedBy?.name ?? '—'}</Text></Table.Td>
                        <Table.Td>
                          <Group gap={8} wrap="nowrap">
                            <Group gap={2}><IconPolygon size={14} /><Text fz="sm">{s._count.features}</Text></Group>
                            <Group gap={2}><IconPhoto size={14} /><Text fz="sm">{s._count.photos}</Text></Group>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="sm">{formatDateTime(s.receivedAt)}</Text>
                          {s.status !== 'RECEIVED' && <Badge size="xs" variant="light" color={SURVEY_STATUS_COLORS[s.status]}>{SURVEY_STATUS_LABELS[s.status]}</Badge>}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card withBorder padding="sm">
            <Text fz="sm" fw={600} mb="xs">Onde foram feitos</Text>
            <MapView height={360} points={points} onPointClick={(p) => navigate(`/levantamentos/${p.id}`)} initialBasemap="satellite" />
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
