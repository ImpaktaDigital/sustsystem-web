import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Grid, Group, SegmentedControl, Stack, TagsInput, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Client } from '../../api/types';
import { AddressFields } from '../../components/AddressFields';
import { LoadingBlock, PageHeader } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { maskCnae, maskCpfCnpj, maskPhone } from '../../lib/masks';
import { isValidDocument, onlyDigits } from '../../lib/shared';

const optional = z.string().trim().optional().or(z.literal(''));
const cnae = z.string().optional().refine((v) => !v || onlyDigits(v).length === 7, 'CNAE deve ter 7 dígitos');

const schema = z
  .object({
    type: z.enum(['PF', 'PJ']),
    name: z.string().trim().min(2, 'Informe o nome / razão social'),
    tradeName: optional,
    document: z.string().min(1, 'Informe o CPF/CNPJ'),
    stateRegistration: optional,
    municipalRegistration: optional,
    mainCnae: cnae,
    secondaryCnaes: z.array(z.string()).refine((list) => list.every((v) => onlyDigits(v).length === 7), 'Cada CNAE deve ter 7 dígitos'),
    email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
    phone: optional,
    zipCode: optional,
    street: optional,
    number: optional,
    complement: optional,
    district: optional,
    city: optional,
    state: z.string().nullable().optional(),
    notes: optional,
  })
  .refine((v) => isValidDocument(v.type, v.document), { path: ['document'], message: 'CPF/CNPJ inválido' });

type FormValues = z.infer<typeof schema>;

const empty: FormValues = {
  type: 'PJ', name: '', tradeName: '', document: '', stateRegistration: '', municipalRegistration: '', mainCnae: '',
  secondaryCnaes: [], email: '', phone: '', zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: null, notes: '',
};

/** Converte '' em undefined (criação) ou null (edição, para limpar o campo). */
function toPayload(values: FormValues, editing: boolean) {
  const blank = editing ? null : undefined;
  const clean = (v?: string | null) => (v && v.trim() ? v.trim() : blank);
  return {
    ...(editing ? {} : { type: values.type, document: onlyDigits(values.document) }),
    name: values.name.trim(),
    tradeName: clean(values.tradeName),
    stateRegistration: clean(values.stateRegistration),
    municipalRegistration: clean(values.municipalRegistration),
    mainCnae: values.mainCnae ? onlyDigits(values.mainCnae) : blank,
    secondaryCnaes: values.secondaryCnaes.map(onlyDigits),
    email: clean(values.email),
    phone: clean(values.phone),
    zipCode: values.zipCode ? onlyDigits(values.zipCode) : blank,
    street: clean(values.street),
    number: clean(values.number),
    complement: clean(values.complement),
    district: clean(values.district),
    city: clean(values.city),
    state: values.state || blank,
    notes: clean(values.notes),
  };
}

/** Cadastro e edição de cliente PF/PJ (US09, US10). */
export function ClientFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({ queryKey: ['client', id], queryFn: () => api.get<Client>(`/clients/${id}`), enabled: editing });
  const { register, control, handleSubmit, reset, setValue, watch, formState } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });
  const type = watch('type');

  useEffect(() => {
    const c = existing.data;
    if (!c) return;
    reset({
      type: c.type, name: c.name, tradeName: c.tradeName ?? '', document: c.document, stateRegistration: c.stateRegistration ?? '',
      municipalRegistration: c.municipalRegistration ?? '', mainCnae: c.mainCnae ?? '', secondaryCnaes: c.secondaryCnaes.map(maskCnae),
      email: c.email ?? '', phone: c.phone ?? '', zipCode: c.zipCode ?? '', street: c.street ?? '', number: c.number ?? '',
      complement: c.complement ?? '', district: c.district ?? '', city: c.city ?? '', state: c.state, notes: c.notes ?? '',
    });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing ? api.patch<Client>(`/clients/${id}`, toPayload(values, true)) : api.post<Client>('/clients', toPayload(values, false)),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.setQueryData(['client', client.id], client);
      notifySuccess(editing ? 'Cliente atualizado' : 'Cliente cadastrado');
      navigate(`/clientes/${client.id}`);
    },
    onError: (e) => notifyError(e),
  });

  if (editing && existing.isLoading) return <LoadingBlock />;
  const pj = type === 'PJ';

  return (
    <>
      <PageHeader
        title={editing ? 'Editar cliente' : 'Novo cliente'}
        breadcrumbs={[{ label: 'Clientes', to: '/clientes' }, ...(editing ? [{ label: existing.data?.name ?? '', to: `/clientes/${id}` }] : []), { label: editing ? 'Editar' : 'Novo' }]}
      />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Stack>
          <Card withBorder padding="lg">
            <Title order={4} mb="md">Identificação</Title>
            <Grid>
              <Grid.Col span={12}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <div>
                      <Text fz="sm" fw={500} mb={4}>Tipo de pessoa</Text>
                      <SegmentedControl
                        {...field}
                        disabled={editing}
                        data={[{ value: 'PJ', label: 'Pessoa jurídica' }, { value: 'PF', label: 'Pessoa física' }]}
                      />
                      {editing && <Text fz="xs" c="dimmed" mt={4}>Tipo e documento não podem ser alterados após o cadastro.</Text>}
                    </div>
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Controller
                  control={control}
                  name="document"
                  render={({ field }) => (
                    <TextInput
                      label={pj ? 'CNPJ' : 'CPF'}
                      withAsterisk
                      disabled={editing}
                      placeholder={pj ? '00.000.000/0000-00' : '000.000.000-00'}
                      {...field}
                      value={maskCpfCnpj(field.value)}
                      error={formState.errors.document?.message}
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <TextInput label={pj ? 'Razão social' : 'Nome completo'} withAsterisk {...register('name')} error={formState.errors.name?.message} />
              </Grid.Col>
              {pj && (
                <>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label="Nome fantasia" {...register('tradeName')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <TextInput label="Inscrição estadual" {...register('stateRegistration')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <TextInput label="Inscrição municipal" {...register('municipalRegistration')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Controller
                      control={control}
                      name="mainCnae"
                      render={({ field }) => (
                        <TextInput label="CNAE principal" placeholder="0000-0/00" {...field} value={maskCnae(field.value ?? '')} error={formState.errors.mainCnae?.message} />
                      )}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 8 }}>
                    <Controller
                      control={control}
                      name="secondaryCnaes"
                      render={({ field }) => (
                        <TagsInput
                          label="CNAEs secundários"
                          description="Digite o código e pressione Enter"
                          {...field}
                          onChange={(values) => field.onChange(values.map(maskCnae))}
                          error={formState.errors.secondaryCnaes?.message}
                        />
                      )}
                    />
                  </Grid.Col>
                </>
              )}
            </Grid>
          </Card>

          <Card withBorder padding="lg">
            <Title order={4} mb="md">Contato e endereço</Title>
            <Grid mb="sm">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="E-mail" type="email" {...register('email')} error={formState.errors.email?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => <TextInput label="Telefone" {...field} value={maskPhone(field.value ?? '')} />}
                />
              </Grid.Col>
            </Grid>
            <AddressFields control={control} setValue={setValue} />
          </Card>

          <Card withBorder padding="lg">
            <Textarea label="Observações" autosize minRows={3} {...register('notes')} />
          </Card>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Salvar alterações' : 'Cadastrar cliente'}</Button>
          </Group>
        </Stack>
      </form>
    </>
  );
}
