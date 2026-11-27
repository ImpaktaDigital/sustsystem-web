import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Anchor, Button, PasswordInput, Stack } from '@mantine/core';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError, session } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { notifySuccess } from '../../components/notify';
import { AuthCard } from './AuthCard';
import { PASSWORD_HINT, passwordSchema } from './passwordRules';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });

/** Destino dos links de convite e de redefinição de senha enviados por e-mail. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password }, false);
      // A redefinição encerra todas as sessões do usuário na API
      if (status === 'authenticated') await logout();
      else session.clear();
      notifySuccess('Senha definida. Entre com a nova senha.');
      navigate('/login', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível definir a senha');
    }
  });

  if (!token) {
    return (
      <AuthCard title="Link inválido">
        <Stack>
          <Alert color="red" variant="light">O link está incompleto. Abra novamente o link recebido por e-mail ou solicite um novo.</Alert>
          <Anchor component={Link} to="/esqueci-senha" ta="center" fz="sm">Solicitar novo link</Anchor>
        </Stack>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Definir senha" subtitle="Escolha a senha que você usará para acessar o SustSystem.">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error} <Anchor component={Link} to="/esqueci-senha" fz="sm">Solicitar novo link</Anchor>
            </Alert>
          )}
          <PasswordInput label="Nova senha" description={PASSWORD_HINT} autoComplete="new-password" autoFocus {...register('password')} error={formState.errors.password?.message} />
          <PasswordInput label="Confirme a nova senha" autoComplete="new-password" {...register('confirm')} error={formState.errors.confirm?.message} />
          <Button type="submit" loading={formState.isSubmitting} fullWidth>Salvar senha</Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
