/** Máscaras de entrada (formatação progressiva enquanto o usuário digita). */
import { onlyDigits } from './shared';

export function maskCpfCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function maskCpf(value: string) {
  return maskCpfCnpj(onlyDigits(value).slice(0, 11));
}

export function maskCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function maskCep(value: string) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
}

export function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

/** CNAE: 7 dígitos → 0000-0/00 */
export function maskCnae(value: string) {
  return onlyDigits(value).slice(0, 7).replace(/(\d{4})(\d)/, '$1-$2').replace(/(\d{4}-\d)(\d{1,2})$/, '$1/$2');
}

/** CAR: UF-IBGE-XXXX.XXXX.XXXX.XXXX.XXXX.XXXX.XXXX.XXXX */
export function formatCar(value?: string | null) {
  if (!value) return '';
  const m = value.toUpperCase().replace(/[\s.]/g, '').match(/^([A-Z]{2})-(\d{7})-([0-9A-Z]{32})$/);
  if (!m) return value;
  return `${m[1]}-${m[2]}-${m[3].match(/.{4}/g)!.join('.')}`;
}

export const formatArea = (m2?: number | null) =>
  m2 == null ? '—' : `${m2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²${m2 >= 10_000 ? ` (${(m2 / 10_000).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ha)` : ''}`;

export const formatDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
