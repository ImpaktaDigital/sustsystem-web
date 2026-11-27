import { describe, expect, it } from 'vitest';
import { formatCar, maskCep, maskCnae, maskCpfCnpj, maskPhone } from './masks';

describe('máscaras', () => {
  it('CPF e CNPJ progressivos', () => {
    expect(maskCpfCnpj('529982')).toBe('529.982');
    expect(maskCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('CEP, telefone e CNAE', () => {
    expect(maskCep('01310100')).toBe('01310-100');
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321');
    expect(maskPhone('1140000000')).toBe('(11) 4000-0000');
    expect(maskCnae('2222600')).toBe('2222-6/00');
  });
  it('CAR', () => {
    expect(formatCar('SP-3509502-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D')).toBe('SP-3509502-1A2B.3C4D.5E6F.7A8B.9C0D.1E2F.3A4B.5C6D');
  });
});
