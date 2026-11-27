import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Anchor, Button, Divider, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { maskCnpj } from '../../lib/masks';
import { isValidCnpj, onlyDigits } from '../../lib/shared';
import { AuthCard } from './AuthCard';
import { PASSWORD_HINT, passwordSchema } from './passwordRules';

const schema = z
  .object({
    organizationName: z.string().trim().min(2, 'Informe o nome da organização'),
    organizationDocument: z.string().optional().refine((v) => !v || isValidCnpj(v), 'CNPJ inválido'),
    name: z.string().trim().min(2, 'Informe seu nome'),
    email: z.string().trim().email('Informe um e-mail válido'),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });

type FormValues = z.infer<typeof schema>;

/** Autocadastro de organização (RF03). A landing page comercial, quando existir, aponta para esta tela. */
export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, control, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ confirm: _confirm, organizationDocument, ...values }) => {
    setError(null);
    try {
      await signup({ ...values, organizationDocument: organizationDocument ? onlyDigits(organizationDocument) : undefined });
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir o cadastro');
    }
  });

  return (
    <AuthCard title="Cadastre sua organização" subtitle="Crie o acesso do seu escritório ou empresa. Você será o administrador." width={480}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {error && <Alert color="red" variant="light">{error}</Alert>}
          <TextInput label="Nome da organização" placeholder="Escritório Verde Engenharia Ambiental" withAsterisk {...register('organizationName')} error={formState.errors.organizationName?.message} />
          <Controller
            control={control}
            name="organizationDocument"
            render={({ field }) => (
              <TextInput
                label="CNPJ"
                description="Opcional"
                placeholder="00.000.000/0000-00"
                {...field}
                value={maskCnpj(field.value ?? '')}
                error={formState.errors.organizationDocument?.message}
              />
            )}
          />
          <Divider label="Seus dados de acesso" labelPosition="left" />
          <TextInput label="Seu nome" withAsterisk autoComplete="name" {...register('name')} error={formState.errors.name?.message} />
          <TextInput label="E-mail" type="email" withAsterisk autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
          <PasswordInput label="Senha" description={PASSWORD_HINT} withAsterisk autoComplete="new-password" {...register('password')} error={formState.errors.password?.message} />
          <PasswordInput label="Confirme a senha" withAsterisk autoComplete="new-password" {...register('confirm')} error={formState.errors.confirm?.message} />
          <Button type="submit" loading={formState.isSubmitting} fullWidth>Criar conta</Button>
          <Text ta="center" fz="sm">Já tem acesso? <Anchor component={Link} to="/login">Entrar</Anchor></Text>
        </Stack>
      </form>
    </AuthCard>
  );
}
