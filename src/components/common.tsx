import { Anchor, Badge, Breadcrumbs, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { RecordStatus } from '../api/types';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; to?: string }>;
}) {
  return (
    <Stack gap={6} mb="lg">
      {breadcrumbs && (
        <Breadcrumbs separatorMargin={6}>
          {breadcrumbs.map((b) =>
            b.to ? (
              <Anchor key={b.label} component={Link} to={b.to} fz="sm">{b.label}</Anchor>
            ) : (
              <Text key={b.label} fz="sm" c="dimmed">{b.label}</Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <div>
          <Title order={2}>{title}</Title>
          {description && <Text c="dimmed" fz="sm" mt={2}>{description}</Text>}
        </div>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
    </Stack>
  );
}

export function StatusBadge({ status }: { status: RecordStatus }) {
  return status === 'ACTIVE' ? (
    <Badge color="forest" variant="light">Ativo</Badge>
  ) : (
    <Badge color="gray" variant="light">Inativo</Badge>
  );
}

export function LoadingBlock() {
  return (
    <Center py="xl">
      <Loader />
    </Center>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Center py={40}>
      <Text c="dimmed" ta="center">{children}</Text>
    </Center>
  );
}

/** Par rótulo/valor para telas de detalhe. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div>
      <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text fz="sm">{empty ? '—' : children}</Text>
    </div>
  );
}
