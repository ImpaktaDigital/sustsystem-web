import { Loader, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, type ReactNode } from 'react';
import { formatCnae, useCnae, type CnaeInfo } from '../lib/cnae';
import { maskCnae } from '../lib/masks';
import { onlyDigits } from '../lib/shared';

interface CnaeInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  error?: string;
  /** Chamado quando a descrição do código digitado é obtida no IBGE. */
  onResolved?: (info: CnaeInfo) => void;
  /** Exibe a descrição do IBGE abaixo do campo (padrão: sim). */
  showDescription?: boolean;
}

/** Campo de CNAE com máscara e descrição consultada na API do IBGE. */
export function CnaeInput({ value, onChange, onBlur, label, error, onResolved, showDescription = true }: CnaeInputProps) {
  const digits = onlyDigits(value ?? '');
  const lookup = useCnae(digits);
  const resolvedRef = useRef(onResolved);
  resolvedRef.current = onResolved;

  useEffect(() => {
    if (lookup.data) resolvedRef.current?.(lookup.data);
  }, [lookup.data]);

  let hint: ReactNode = null;
  if (digits.length === 7 && !error) {
    if (lookup.isError) hint = <Text span fz="xs" c="dimmed">Não foi possível consultar o IBGE agora; o código será salvo mesmo assim.</Text>;
    else if (lookup.data === null) hint = <Text span fz="xs" c="orange.8">Código não encontrado na tabela CNAE do IBGE. Confira os dígitos.</Text>;
    else if (lookup.data && showDescription) hint = <Text span fz="xs" c="forest.8">{lookup.data.description}</Text>;
  }

  return (
    <TextInput
      label={label}
      aria-label={label ?? 'CNAE'}
      placeholder="0000-0/00"
      value={maskCnae(value ?? '')}
      onChange={(e) => onChange(maskCnae(e.currentTarget.value))}
      onBlur={onBlur}
      error={error}
      description={hint}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      rightSection={lookup.isFetching ? <Loader size={14} /> : null}
    />
  );
}

/** Exibição somente leitura: "0000-0/00 — Descrição (IBGE)". */
export function CnaeText({ code, fz = 'sm' }: { code: string; fz?: string }) {
  const { data, isLoading } = useCnae(code);
  return (
    <Text span fz={fz}>
      <Text span ff="monospace" fz={fz}>{maskCnae(code)}</Text>
      {data ? ` — ${data.description}` : isLoading ? <Text span c="dimmed" fz={fz}> — consultando IBGE…</Text> : null}
    </Text>
  );
}

export { formatCnae };
