import { Badge, Button, Card, Group, Menu, Table, Text } from '@mantine/core';
import { IconDownload, IconFileTypePdf, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PLANT_KIND_LABELS, type PlantRecord, type PlantSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, LoadingBlock } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { formatDateTime } from '../../lib/masks';
import { buildPlantPdf } from '../../plants/buildPlantPdf';
import { plantFileName, savePdf, specFromRecord } from '../../plants/spec';

const rev = (r: number) => `R${String(r).padStart(2, '0')}`;
const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Revisões de planta emitidas para o empreendimento (US58–US66), com novo download do PDF. */
export function PlantsPanel({ enterpriseId }: { enterpriseId: string }) {
  const { can } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['plants', enterpriseId], queryFn: () => api.get<PlantSummary[]>(`/enterprises/${enterpriseId}/plants`) });

  const downloadPdf = async (p: PlantSummary) => {
    setBusy(p.id);
    try {
      const record = await api.get<PlantRecord>(`/plants/${p.id}`);
      const spec = specFromRecord(record);
      savePdf(await buildPlantPdf(spec), plantFileName(spec));
      notifySuccess(`${p.title} ${rev(p.revision)} gerada`);
    } catch (e) {
      notifyError(e, (e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Card withBorder padding={0}>
      <Group justify="space-between" p="md">
        <div>
          <Text fw={600}>Plantas emitidas</Text>
          <Text fz="xs" c="dimmed">Cada revisão guarda as versões de área, os elementos e o carimbo usados; o PDF é gerado novamente de forma idêntica.</Text>
        </div>
        {can('plants.issue') && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target><Button leftSection={<IconPlus size={16} />}>Nova planta</Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to={`/empreendimentos/${enterpriseId}/plantas/nova?tipo=delimitacao`}>Planta de delimitação</Menu.Item>
              <Menu.Item component={Link} to={`/empreendimentos/${enterpriseId}/plantas/nova?tipo=localizacao`}>Planta de localização</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      {isLoading ? <LoadingBlock /> : !data?.length ? <EmptyState>Nenhuma planta emitida.</EmptyState> : (
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr><Table.Th>Planta</Table.Th><Table.Th>Revisão</Table.Th><Table.Th>Data</Table.Th><Table.Th>Responsável técnico</Table.Th><Table.Th>Folha / escala</Table.Th><Table.Th>Emitida</Table.Th><Table.Th w={150} /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap"><IconFileTypePdf size={18} color="var(--mantine-color-red-7)" /><Text fz="sm" fw={600}>{p.title}</Text></Group>
                    {p.title !== PLANT_KIND_LABELS[p.kind] && <Text fz="xs" c="dimmed">{PLANT_KIND_LABELS[p.kind]}</Text>}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{rev(p.revision)}</Badge>
                    {p.revisionNotes && <Text fz="xs" c="dimmed">{p.revisionNotes}</Text>}
                  </Table.Td>
                  <Table.Td><Text fz="sm">{date(p.issueDate)}</Text></Table.Td>
                  <Table.Td><Text fz="sm">{p.responsibleName}</Text></Table.Td>
                  <Table.Td><Text fz="sm">{p.sheetSize} · 1:{p.scaleDenominator.toLocaleString('pt-BR')}</Text></Table.Td>
                  <Table.Td><Text fz="xs">{formatDateTime(p.createdAt)}</Text><Text fz="xs" c="dimmed">{p.issuedBy?.name}</Text></Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} loading={busy === p.id} onClick={() => downloadPdf(p)}>Baixar PDF</Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}
