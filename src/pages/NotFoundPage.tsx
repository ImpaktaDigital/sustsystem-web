import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Center py={80}>
      <Stack align="center" gap="xs">
        <Title order={2}>Página não encontrada</Title>
        <Text c="dimmed">O endereço não existe ou você não tem acesso a ele.</Text>
        <Button component={Link} to="/" variant="light" mt="sm">Ir para o painel</Button>
      </Stack>
    </Center>
  );
}
