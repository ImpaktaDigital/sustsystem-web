import { Grid, Loader, Select, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Controller, type Control, type FieldValues, type Path, type UseFormSetValue } from 'react-hook-form';
import { maskCep } from '../lib/masks';
import { onlyDigits } from '../lib/shared';

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

interface ViaCep {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

/**
 * Campos de endereço com preenchimento automático pelo CEP (ViaCEP, serviço público).
 * O formulário que usa este componente deve ter os campos zipCode, street, number, complement, district, city, state.
 */
export function AddressFields<T extends FieldValues>({ control, setValue }: { control: Control<T>; setValue: UseFormSetValue<T> }) {
  const [loading, setLoading] = useState(false);
  const name = (n: string) => n as Path<T>;

  const lookup = async (cep: string) => {
    if (onlyDigits(cep).length !== 8) return;
    setLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${onlyDigits(cep)}/json/`);
      const data: ViaCep = await res.json();
      if (!data.erro) {
        const set = (field: string, value?: string) => value && setValue(name(field), value as never, { shouldDirty: true });
        set('street', data.logradouro);
        set('district', data.bairro);
        set('city', data.localidade);
        set('state', data.uf);
      }
    } catch { /* sem conexão: preenchimento manual */ }
    setLoading(false);
  };

  const text = (field: string, label: string, span: number, extra?: object) => (
    <Grid.Col span={{ base: 12, sm: span }}>
      <Controller
        control={control}
        name={name(field)}
        render={({ field: f, fieldState }) => (
          <TextInput label={label} {...f} value={f.value ?? ''} error={fieldState.error?.message} {...extra} />
        )}
      />
    </Grid.Col>
  );

  return (
    <Grid>
      <Grid.Col span={{ base: 12, sm: 3 }}>
        <Controller
          control={control}
          name={name('zipCode')}
          render={({ field, fieldState }) => (
            <TextInput
              label="CEP"
              placeholder="00000-000"
              {...field}
              value={maskCep(field.value ?? '')}
              onChange={(e) => {
                field.onChange(e.currentTarget.value);
                void lookup(e.currentTarget.value);
              }}
              rightSection={loading ? <Loader size={14} /> : null}
              error={fieldState.error?.message}
            />
          )}
        />
      </Grid.Col>
      {text('street', 'Logradouro', 7)}
      {text('number', 'Número', 2)}
      {text('complement', 'Complemento', 4)}
      {text('district', 'Bairro', 4)}
      {text('city', 'Município', 3)}
      <Grid.Col span={{ base: 12, sm: 1 }}>
        <Controller
          control={control}
          name={name('state')}
          render={({ field, fieldState }) => (
            <Select label="UF" data={UFS} searchable clearable {...field} value={field.value ?? null} error={fieldState.error?.message} />
          )}
        />
      </Grid.Col>
    </Grid>
  );
}

export const formatAddress = (a: { street?: string | null; number?: string | null; complement?: string | null; district?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }) =>
  [
    [a.street, a.number].filter(Boolean).join(', '),
    a.complement,
    a.district,
    [a.city, a.state].filter(Boolean).join('/'),
    a.zipCode ? `CEP ${maskCep(a.zipCode)}` : null,
  ]
    .filter(Boolean)
    .join(' — ');
