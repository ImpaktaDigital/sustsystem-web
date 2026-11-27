import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Button, Card, Grid, Group, PasswordInput, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field, PageHeader } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { formatDateTime } from '../lib/masks';
import { ROLE_LABELS } from '../lib/shared';
import { PASSWORD_HINT, passwordSchema } from './auth/passwordRules';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Informe a senha atual'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });
type FormValues = z.infer<typeof schema>;

/** Perfil do usuário (US06), troca de senha e de organização. */
export function ProfilePage() {
  const { me, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });
  if (!me) return null;

  const changePassword = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      reset({ currentPassword: '', newPassword: '', confirm: '' });
      notifySuccess('Senha alterada. As outras sessões foram encerradas.');
    } catch (e) {
      notifyError(e);
    }
  });

  return (
    <>
      <PageHeader title="Meu perfil" />
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack>
            <Card withBorder padding="lg">
              <Title order={5} mb="md">Dados</Title>
              <SimpleGrid cols={2} spacing="lg">
                <Field label="Nome">{me.user.name}</Field>
                <Field label="E-mail">{me.user.email}</Field>
                <Field label="Perfil">{me.roleLabel}</Field>
                <Field label="Último acesso">{formatDateTime(me.user.lastLoginAt)}</Field>
              </SimpleGrid>
              {me.user.isPlatformAdmin && <Badge mt="md" color="slateBlue" variant="light">Operador da plataforma</Badge>}
            </Card>

            <Card withBorder padding="lg">
              <Title order={5} mb="md">Organizações</Title>
              <Table>
                <Table.Tbody>
                  {me.organizations.map((o) => (
                    <Table.Tr key={o.id}>
                      <Table.Td><Text fz="sm" fw={600}>{o.name}</Text><Text fz="xs" c="dimmed">{ROLE_LABELS[o.role]}</Text></Table.Td>
                      <Table.Td ta="right">
                        {o.id === me.organization.id ? <Badge variant="light">Atual</Badge> : (
                          <Button size="xs" variant="light" onClick={() => switchOrganization(o.id).then(() => navigate('/')).catch(notifyError)}>Acessar</Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="lg">
            <Title order={5} mb="md">Alterar senha</Title>
            <form onSubmit={changePassword} noValidate>
              <Stack>
                <PasswordInput label="Senha atual" autoComplete="current-password" {...register('currentPassword')} error={formState.errors.currentPassword?.message} />
                <PasswordInput label="Nova senha" description={PASSWORD_HINT} autoComplete="new-password" {...register('newPassword')} error={formState.errors.newPassword?.message} />
                <PasswordInput label="Confirme a nova senha" autoComplete="new-password" {...register('confirm')} error={formState.errors.confirm?.message} />
                <Group justify="flex-end"><Button type="submit" loading={formState.isSubmitting}>Alterar senha</Button></Group>
              </Stack>
            </form>
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
