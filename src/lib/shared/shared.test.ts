import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf, formatDocument, utmZoneFor, permissionsFor } from './index';

describe('documentos', () => {
  it('valida CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('valida CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('formata documentos', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('zona UTM', () => {
  it('São Paulo → 23S / EPSG:31983', () => {
    expect(utmZoneFor(-46.63, -23.55)).toMatchObject({ zone: 23, hemisphere: 'S', epsg: 31983 });
  });
  it('Porto Alegre → 22S / EPSG:31982', () => {
    expect(utmZoneFor(-51.23, -30.03)).toMatchObject({ zone: 22, hemisphere: 'S', epsg: 31982 });
  });
  it('Boa Vista (hemisfério norte) → 20N / EPSG:31974', () => {
    expect(utmZoneFor(-60.67, 2.82)).toMatchObject({ zone: 20, hemisphere: 'N', epsg: 31974 });
  });
});

describe('permissões', () => {
  it('cliente não tem permissões internas por padrão', () => {
    expect(permissionsFor('CLIENT')).toHaveLength(0);
  });
});
