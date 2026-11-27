import { Pagination, Stack, Text, Timeline } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { AuditLog, Paginated } from '../api/types';
import { formatDateTime } from '../lib/masks';
import { EmptyState, LoadingBlock } from './common';

const ACTION_LABELS: Record<string, string> = {
  create: 'Cadastro criado',
  update: 'Dados alterados',
  activate: 'Reativado',
  deactivate: 'Desativado',
  add_contact: 'Contato adicionado',
  update_contact: 'Contato alterado',
  remove_contact: 'Contato removido',
  set_assignments: 'Equipe atribuída alterada',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'nome', tradeName: 'nome fantasia', email: 'e-mail', phone: 'telefone', notes: 'observações',
  street: 'logradouro', number: 'número', city: 'município', state: 'UF', zipCode: 'CEP', district: 'bairro',
  latitude: 'latitude', longitude: 'longitude', responsibleUserId: 'responsável', type: 'tipo', code: 'identificação',
  totalAreaM2: 'área total', builtAreaM2: 'área construída', carNumber: 'CAR', activities: 'atividades',
  mainCnae: 'CNAE principal', secondaryCnaes: 'CNAEs secundários',
};

function describe(log: AuditLog) {
  const d = log.details ?? {};
  if (log.action === 'update') {
    const fields = Object.keys(d).map((k) => FIELD_LABELS[k] ?? k);
    return fields.length ? `Campos: ${fields.join(', ')}` : null;
  }
  if (typeof d.name === 'string') return String(d.name);
  return null;
}

/** Histórico de alterações de uma entidade (RF40, US12, US20). */
export function AuditTimeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityType, entityId, page],
    queryFn: () => api.get<Paginated<AuditLog>>('/audit-logs', { entityType, entityId, page, pageSize: 15 }),
  });

  if (isLoading) return <LoadingBlock />;
  if (!data?.items.length) return <EmptyState>Nenhum registro no histórico.</EmptyState>;

  return (
    <Stack>
      <Timeline bulletSize={14} lineWidth={2}>
        {data.items.map((log) => (
          <Timeline.Item key={log.id} title={ACTION_LABELS[log.action] ?? log.action}>
            {describe(log) && <Text fz="sm">{describe(log)}</Text>}
            <Text fz="xs" c="dimmed">{formatDateTime(log.createdAt)} · {log.user?.name ?? 'Sistema'}</Text>
          </Timeline.Item>
        ))}
      </Timeline>
      {data.total > data.pageSize && <Pagination total={Math.ceil(data.total / data.pageSize)} value={page} onChange={setPage} size="sm" />}
    </Stack>
  );
}
