import { Center, Paper, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';

export function AuthCard({ title, subtitle, children, width = 420 }: { title: string; subtitle?: string; children: ReactNode; width?: number }) {
  return (
    <Center mih="100vh" p="md" style={{ background: 'linear-gradient(160deg, #ecf7f1 0%, #f8faf9 55%, #eef3f9 100%)' }}>
      <Stack w="100%" maw={width} gap="lg">
        <Center><Logo size="lg" /></Center>
        <Paper withBorder shadow="sm" p="xl" radius="lg">
          <Title order={3} mb={4}>{title}</Title>
          {subtitle && <Text c="dimmed" fz="sm" mb="lg">{subtitle}</Text>}
          {children}
        </Paper>
        <Text ta="center" fz="xs" c="dimmed">Plataforma de gestão e engenharia ambiental</Text>
      </Stack>
    </Center>
  );
}
