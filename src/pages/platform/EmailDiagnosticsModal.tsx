import { Alert, Badge, Button, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

interface EmailStatus {
  provider: 'brevo' | 'resend' | 'smtp' | 'log';
  from: string | null;
  fromName: string;
  verification: { ok: boolean; detail: string };
}

const PROVIDER_LABELS: Record<EmailStatus['provider'], string> = {
  brevo: 'Brevo (API HTTP)',
  resend: 'Resend (API HTTP)',
  smtp: 'SMTP',
  log: 'Nenhum (modo log)',
};

/** Diagnóstico do envio de e-mail: provedor, verificação de credenciais e envio de teste. */
export function EmailDiagnosticsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const [to, setTo] = useState(me?.user.email ?? '');
  const status = useQuery({
    queryKey: ['platform', 'email-status'],
    queryFn: () => api.get<EmailStatus>('/platform/email/status'),
    enabled: opened,
    staleTime: 0,
  });
  const test = useMutation({ mutationFn: () => api.post<{ sent: boolean; provider: string }>('/platform/email/test', { to }) });

  return (
    <Modal opened={opened} onClose={() => { test.reset(); onClose(); }} title="Diagnóstico de e-mail" size="lg">
      <Stack>
        {status.isLoading ? <Group><Loader size="sm" /><Text fz="sm">Verificando provedor…</Text></Group> : status.data && (
          <Stack gap={6}>
            <Group gap="xs">
              <Text fz="sm" fw={600}>Provedor:</Text>
              <Badge variant="light" color={status.data.provider === 'log' ? 'gray' : 'slateBlue'}>{PROVIDER_LABELS[status.data.provider]}</Badge>
            </Group>
            <Text fz="sm"><b>Remetente:</b> {status.data.from ? `${status.data.fromName} <${status.data.from}>` : '—'}</Text>
            <Alert color={status.data.verification.ok ? 'forest' : 'red'} variant="light">{status.data.verification.detail}</Alert>
          </Stack>
        )}
        {status.error && <Alert color="red" variant="light">{(status.error as ApiError).message}</Alert>}

        <Group align="flex-end">
          <TextInput label="Enviar e-mail de teste para" type="email" value={to} onChange={(e) => setTo(e.currentTarget.value)} style={{ flex: 1 }} />
          <Button onClick={() => test.mutate()} loading={test.isPending} disabled={!to.includes('@')}>Enviar teste</Button>
        </Group>
        {test.isSuccess && (
          <Alert color={test.data.sent ? 'forest' : 'yellow'} variant="light">
            {test.data.sent ? `Mensagem aceita pelo provedor. Verifique a caixa de entrada (e o spam) de ${to}.` : 'Modo log: a mensagem foi apenas registrada no log do servidor.'}
          </Alert>
        )}
        {test.isError && <Alert color="red" variant="light">{(test.error as ApiError).message}</Alert>}
      </Stack>
    </Modal>
  );
}
