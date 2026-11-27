import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Checkbox, Grid, Group, Modal, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Contact } from '../../api/types';
import { notifyError, notifySuccess } from '../../components/notify';
import { maskPhone } from '../../lib/masks';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome'),
  position: z.string().optional(),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  isPrimary: z.boolean(),
  isLegalRepresentative: z.boolean(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Cadastro/edição de contato e responsável do cliente (RF09, US11). */
export function ContactModal({ clientId, contact, opened, onClose }: { clientId: string; contact: Contact | null; opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (opened) {
      reset({
        name: contact?.name ?? '', position: contact?.position ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '',
        isPrimary: contact?.isPrimary ?? false, isLegalRepresentative: contact?.isLegalRepresentative ?? false, notes: contact?.notes ?? '',
      });
    }
  }, [opened, contact, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const blank = contact ? null : undefined;
      const body = {
        name: v.name.trim(),
        position: v.position?.trim() || blank,
        email: v.email?.trim() || blank,
        phone: v.phone?.trim() || blank,
        isPrimary: v.isPrimary,
        isLegalRepresentative: v.isLegalRepresentative,
        notes: v.notes?.trim() || blank,
      };
      return contact ? api.patch(`/clients/${clientId}/contacts/${contact.id}`, body) : api.post(`/clients/${clientId}/contacts`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'client', clientId] });
      notifySuccess(contact ? 'Contato atualizado' : 'Contato adicionado');
      onClose();
    },
    onError: (e) => notifyError(e),
  });

  return (
    <Modal opened={opened} onClose={onClose} title={contact ? 'Editar contato' : 'Novo contato'} size="lg">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <TextInput label="Nome" withAsterisk data-autofocus {...register('name')} error={formState.errors.name?.message} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <TextInput label="Cargo / função" {...register('position')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <TextInput label="E-mail" type="email" {...register('email')} error={formState.errors.email?.message} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <Controller control={control} name="phone" render={({ field }) => <TextInput label="Telefone" {...field} value={maskPhone(field.value ?? '')} />} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Group>
              <Controller control={control} name="isPrimary" render={({ field }) => <Checkbox label="Contato principal" checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
              <Controller control={control} name="isLegalRepresentative" render={({ field }) => <Checkbox label="Representante legal" checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
            </Group>
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Observações" autosize minRows={2} {...register('notes')} />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </Group>
      </form>
    </Modal>
  );
}
