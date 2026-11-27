import { useQuery } from '@tanstack/react-query';
import { maskCnae } from './masks';
import { onlyDigits } from './shared';

/**
 * Consulta da descrição de subclasses CNAE 2.3 na API pública do IBGE (servicodados.ibge.gov.br).
 * O banco guarda somente o código; a descrição é obtida aqui apenas para exibição.
 */
const IBGE_CNAE_URL = 'https://servicodados.ibge.gov.br/api/v2/cnae/subclasses';

export interface CnaeInfo {
  code: string;
  description: string;
}

/** "FABRICAÇÃO DE EMBALAGENS" → "Fabricação de embalagens" */
export function sentenceCase(text: string) {
  const lower = text.trim().toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

/** Retorna a subclasse ou null quando o código não existe na tabela do IBGE. */
export async function fetchCnae(code: string): Promise<CnaeInfo | null> {
  const digits = onlyDigits(code);
  if (digits.length !== 7) return null;
  const res = await fetch(`${IBGE_CNAE_URL}/${digits}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
  const data = (await res.json()) as { id?: string; descricao?: string } | Array<unknown>;
  if (Array.isArray(data) || !data?.descricao) return null; // código inexistente: a API devolve []
  return { code: digits, description: sentenceCase(data.descricao) };
}

/** Descrição do CNAE com cache (a tabela praticamente não muda). */
export function useCnae(code?: string | null) {
  const digits = onlyDigits(code ?? '');
  return useQuery({
    queryKey: ['cnae', digits],
    queryFn: () => fetchCnae(digits),
    enabled: digits.length === 7,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

export const formatCnae = (code: string, description?: string | null) => (description ? `${maskCnae(code)} — ${description}` : maskCnae(code));
