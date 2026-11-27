import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Anchor, Button, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { AuthCard } from './AuthCard';

const schema = z.object({ email: z.string().trim().email('Informe um e-mail válido') });

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email }, false);
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar a solicitação');
    }
  });

  return (
    <AuthCard title="Esqueci minha senha" subtitle="Informe seu e-mail e enviaremos um link para definir uma nova senha.">
      {sent ? (
        <Stack>
          <Alert color="forest" variant="light">
            Se houver uma conta com este e-mail, você receberá o link em instantes. Ele vale por 60 minutos.
            Verifique também a caixa de spam.
          </Alert>
          <Anchor component={Link} to="/login" ta="center" fz="sm">Voltar para o login</Anchor>
        </Stack>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            {error && <Alert color="red" variant="light">{error}</Alert>}
            <TextInput label="E-mail" type="email" autoComplete="email" autoFocus {...register('email')} error={formState.errors.email?.message} />
            <Button type="submit" loading={formState.isSubmitting} fullWidth>Enviar link</Button>
            <Anchor component={Link} to="/login" ta="center" fz="sm">Voltar para o login</Anchor>
          </Stack>
        </form>
      )}
    </AuthCard>
  );
}
