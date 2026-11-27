import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Anchor, Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { AuthCard } from './AuthCard';

const schema = z.object({
  email: z.string().trim().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe a senha'),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível entrar');
    }
  });

  return (
    <AuthCard title="Entrar" subtitle="Acesse sua conta para continuar">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {error && <Alert color="red" variant="light">{error}</Alert>}
          <TextInput label="E-mail" type="email" autoComplete="email" autoFocus {...register('email')} error={formState.errors.email?.message} />
          <PasswordInput label="Senha" autoComplete="current-password" {...register('password')} error={formState.errors.password?.message} />
          <Group justify="flex-end">
            <Anchor component={Link} to="/esqueci-senha" fz="sm">Esqueci minha senha</Anchor>
          </Group>
          <Button type="submit" loading={formState.isSubmitting} fullWidth>Entrar</Button>
          <Text ta="center" fz="sm">
            Ainda não usa o SustSystem? <Anchor component={Link} to="/cadastro">Cadastre sua organização</Anchor>
          </Text>
        </Stack>
      </form>
    </AuthCard>
  );
}
