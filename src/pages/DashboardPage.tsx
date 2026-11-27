import { Card, Group, SimpleGrid, Skeleton, Text, ThemeIcon, Title } from '@mantine/core';
import { IconBuildingCommunity, IconBuildingFactory2, IconMapPin, IconUsers } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { EnterpriseFeatureCollection, Paginated } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/common';
import { MapView } from '../map/MapView';

function StatCard({ label, value, icon, to, loading }: { label: string; value?: number; icon: ReactNode; to: string; loading: boolean }) {
  return (
    <Card withBorder padding="lg" component={Link} to={to} style={{ textDecoration: 'none' }}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text fz="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          {loading ? <Skeleton h={34} w={60} mt={4} /> : <Text fz={30} fw={700} c="dark">{value ?? 0}</Text>}
        </div>
        <ThemeIcon size={48} radius="md" variant="light" color="forest">{icon}</ThemeIcon>
      </Group>
    </Card>
  );
}

const countQuery = (path: string, query?: Record<string, string>) => () =>
  api.get<Paginated<unknown>>(path, { pageSize: 1, ...query }).then((r) => r.total);

/** Painel inicial (seção 11.1). Indicadores de licenças, pendências e tarefas entram com os módulos correspondentes. */
export function DashboardPage() {
  const { me, can } = useAuth();
  const navigate = useNavigate();
  const clients = useQuery({ queryKey: ['clients', 'count'], queryFn: countQuery('/clients', { status: 'ACTIVE' }), enabled: can('clients.read') });
  const enterprises = useQuery({ queryKey: ['enterprises', 'count'], queryFn: countQuery('/enterprises', { status: 'ACTIVE' }), enabled: can('enterprises.read') });
  const users = useQuery({ queryKey: ['users', 'count'], queryFn: countQuery('/users', { status: 'ACTIVE' }), enabled: can('users.read') });
  const geo = useQuery({
    queryKey: ['enterprises', 'geojson'],
    queryFn: () => api.get<EnterpriseFeatureCollection>('/enterprises/geojson'),
    enabled: can('enterprises.read'),
  });

  const points = (geo.data?.features ?? []).map((f) => ({
    id: f.properties.id,
    longitude: f.geometry.coordinates[0],
    latitude: f.geometry.coordinates[1],
    title: f.properties.name,
    subtitle: f.properties.clientName,
  }));

  return (
    <>
      <PageHeader title={`Olá, ${me?.user.name.split(' ')[0]}`} description={me?.organization.name} />
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg">
        {can('clients.read') && <StatCard label="Clientes ativos" value={clients.data} loading={clients.isLoading} icon={<IconBuildingCommunity />} to="/clientes" />}
        {can('enterprises.read') && (
          <StatCard
            label={can('enterprises.read_all') ? 'Empreendimentos ativos' : 'Meus empreendimentos'}
            value={enterprises.data}
            loading={enterprises.isLoading}
            icon={<IconBuildingFactory2 />}
            to="/empreendimentos"
          />
        )}
        {can('users.read') && <StatCard label="Membros da equipe" value={users.data} loading={users.isLoading} icon={<IconUsers />} to="/usuarios" />}
      </SimpleGrid>

      {can('enterprises.read') && (
        <Card withBorder padding="lg">
          <Group gap="xs" mb="sm">
            <IconMapPin size={18} />
            <Title order={4}>Mapa de empreendimentos</Title>
            <Text fz="sm" c="dimmed">({points.length} com localização)</Text>
          </Group>
          <MapView height={440} points={points} onPointClick={(p) => navigate(`/empreendimentos/${p.id}`)} />
        </Card>
      )}
    </>
  );
}
