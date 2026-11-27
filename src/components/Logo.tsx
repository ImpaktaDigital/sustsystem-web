import { Group, Text, ThemeIcon } from '@mantine/core';
import { IconLeaf } from '@tabler/icons-react';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const big = size === 'lg';
  return (
    <Group gap={8} wrap="nowrap">
      <ThemeIcon size={big ? 40 : 30} radius="md" color="forest" aria-hidden>
        <IconLeaf size={big ? 24 : 18} />
      </ThemeIcon>
      <Text fw={750} fz={big ? 24 : 18} c="forest.8" style={{ letterSpacing: 0.3 }}>
        SustSystem
      </Text>
    </Group>
  );
}
