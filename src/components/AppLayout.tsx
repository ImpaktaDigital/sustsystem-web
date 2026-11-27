import { AppShell, Avatar, Badge, Burger, Group, Menu, NavLink, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingCommunity, IconBuildingFactory2, IconChevronDown, IconLayoutDashboard, IconLogout, IconSwitchHorizontal,
  IconDeviceMobile, IconUserCircle, IconPolygon, IconUsers, IconUsersGroup,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../lib/shared';
import { Logo } from './Logo';
import { notifyError } from './notify';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permissions?: Permission[];
  platform?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Painel', icon: <IconLayoutDashboard size={18} /> },
  { to: '/clientes', label: 'Clientes', icon: <IconBuildingCommunity size={18} />, permissions: ['clients.read'] },
  { to: '/empreendimentos', label: 'Empreendimentos', icon: <IconBuildingFactory2 size={18} />, permissions: ['enterprises.read'] },
  { to: '/levantamentos', label: 'Levantamentos', icon: <IconDeviceMobile size={18} />, permissions: ['surveys.review'] },
  { to: '/usuarios', label: 'Equipe e usuários', icon: <IconUsers size={18} />, permissions: ['users.read'] },
  { to: '/configuracoes/tipos-de-area', label: 'Tipos de área e símbolos', icon: <IconPolygon size={18} />, permissions: ['area_types.manage'] },
];

const PLATFORM_NAV: NavItem[] = [
  { to: '/plataforma/organizacoes', label: 'Organizações', icon: <IconUsersGroup size={18} />, platform: true },
];

const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { me, can, logout, switchOrganization } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Levantamentos aguardando triagem (atualiza a cada minuto)
  const pendingSurveys = useQuery({
    queryKey: ['surveys-pending'],
    queryFn: () => api.get<{ pending: number }>('/surveys/pending-count'),
    enabled: !!me && can('surveys.review'),
    refetchInterval: 60_000,
  });
  if (!me) return null;

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));
  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      component={Link}
      to={item.to}
      label={item.label}
      leftSection={item.icon}
      rightSection={item.to === '/levantamentos' && pendingSurveys.data?.pending ? <Badge size="sm" circle color="orange">{pendingSurveys.data.pending}</Badge> : undefined}
      active={isActive(item.to)}
      onClick={close}
      variant="light"
      style={{ borderRadius: 8 }}
    />
  );

  const switchTo = async (id: string) => {
    try {
      await switchOrganization(id);
      navigate('/');
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Abrir menu" />
            <Logo />
          </Group>

          <Menu position="bottom-end" width={260} withinPortal>
            <Menu.Target>
              <UnstyledButton aria-label="Menu do usuário">
                <Group gap="xs" wrap="nowrap">
                  <Avatar color="forest" radius="xl" size={34}>{initials(me.user.name)}</Avatar>
                  <Stack gap={0} visibleFrom="sm">
                    <Text fz="sm" fw={600} lh={1.2}>{me.user.name}</Text>
                    <Text fz="xs" c="dimmed" lh={1.2}>{me.organization.name}</Text>
                  </Stack>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{me.roleLabel}</Menu.Label>
              <Menu.Item component={Link} to="/perfil" leftSection={<IconUserCircle size={16} />}>Meu perfil</Menu.Item>
              {me.organizations.length > 1 && (
                <>
                  <Menu.Divider />
                  <Menu.Label>Trocar de organização</Menu.Label>
                  {me.organizations.map((o) => (
                    <Menu.Item
                      key={o.id}
                      leftSection={<IconSwitchHorizontal size={16} />}
                      disabled={o.id === me.organization.id}
                      onClick={() => switchTo(o.id)}
                    >
                      {o.name}
                    </Menu.Item>
                  ))}
                </>
              )}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => logout().then(() => navigate('/login'))}>
                Sair
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>{NAV.filter((i) => can(...(i.permissions ?? []))).map(renderItem)}</Stack>
          {me.user.isPlatformAdmin && (
            <>
              <Text fz="xs" fw={700} c="dimmed" tt="uppercase" mt="lg" mb={4} px="sm">Plataforma</Text>
              <Stack gap={4}>{PLATFORM_NAV.map(renderItem)}</Stack>
            </>
          )}
        </AppShell.Section>
        <AppShell.Section>
          <Text fz="xs" c="dimmed" px="sm">{me.organization.name}</Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
