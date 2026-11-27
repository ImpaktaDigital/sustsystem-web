import { ActionIcon, Button, Card, Checkbox, Grid, Group, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import { useRef, type ReactNode } from 'react';
import { Controller, useFieldArray, useWatch, type Control, type FieldArrayPath, type FieldErrors, type FieldValues, type Path, type UseFormSetValue } from 'react-hook-form';
import { useCnae } from '../lib/cnae';
import { CnaeInput } from './CnaeField';

/** Formato mínimo do formulário que usa o editor. */
export interface ActivityValue {
  cnae: string;
  description?: string;
  isMain: boolean;
}
interface WithActivities {
  activities: ActivityValue[];
}

interface Props<T extends FieldValues> {
  /** client: só o código é salvo, a descrição vem do IBGE. enterprise: a descrição é salva e preenchida pelo IBGE. */
  mode: 'client' | 'enterprise';
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  errors?: FieldErrors<WithActivities>['activities'];
  /** Ação extra no cabeçalho (ex.: copiar atividades do cliente). */
  onCopy?: () => void;
  copyLabel?: string;
  description?: ReactNode;
}

/** Descrição somente leitura obtida no IBGE (cadastro de cliente). */
function IbgeDescription({ code }: { code: string }) {
  const { data, isFetching } = useCnae(code);
  return (
    <TextInput
      aria-label="Descrição (IBGE)"
      readOnly
      variant="filled"
      value={data?.description ?? (isFetching ? 'Consultando IBGE…' : '')}
      placeholder="Preenchida pela tabela CNAE do IBGE"
    />
  );
}

/** Lista de atividades exercidas (CNAE) com marcação da principal. */
export function ActivitiesEditor<T extends FieldValues>({ mode, control: typedControl, setValue: typedSetValue, errors, onCopy, copyLabel, description }: Props<T>) {
  // O formulário deve ter o campo `activities`; internamente os caminhos são montados dinamicamente.
  const control = typedControl as unknown as Control<WithActivities>;
  const setValue = (name: string, value: unknown, options?: object) => typedSetValue(name as Path<T>, value as never, options);
  const list = useFieldArray({ control, name: 'activities' as FieldArrayPath<WithActivities> });
  const values = (useWatch({ control, name: 'activities' }) ?? []) as ActivityValue[];
  const enterprise = mode === 'enterprise';
  const autoDescriptions = useRef<Record<string, string>>({});
  const rootError = (errors as { message?: string; root?: { message?: string } } | undefined)?.root?.message
    ?? (errors as { message?: string } | undefined)?.message;

  const setMain = (index: number, checked: boolean) => {
    list.fields.forEach((_, j) => setValue(`activities.${j}.isMain`, checked ? j === index : false, { shouldDirty: true, shouldValidate: true }));
  };

  /** Preenche a descrição com a do IBGE quando vazia ou quando ainda é a sugestão automática anterior. */
  const autoFill = (index: number, text: string) => {
    if (!enterprise) return;
    const current = values[index]?.description?.trim() ?? '';
    const key = list.fields[index]?.id;
    if (!key) return;
    if (!current || current === autoDescriptions.current[key]) {
      if (current !== text) setValue(`activities.${index}.description`, text, { shouldDirty: true, shouldValidate: true });
      autoDescriptions.current[key] = text;
    }
  };

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb={description ? 4 : 'md'}>
        <Title order={4}>Atividades exercidas</Title>
        <Group gap="xs">
          {onCopy && <Button size="xs" variant="subtle" leftSection={<IconCopy size={14} />} onClick={onCopy}>{copyLabel ?? 'Copiar'}</Button>}
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => list.append({ cnae: '', ...(enterprise ? { description: '' } : {}), isMain: list.fields.length === 0 })}
          >
            Adicionar atividade
          </Button>
        </Group>
      </Group>
      {description && <Text fz="sm" c="dimmed" mb="md">{description}</Text>}
      {!list.fields.length && <Text fz="sm" c="dimmed">Nenhuma atividade informada.</Text>}
      {!!list.fields.length && (
        <Grid gutter="sm" visibleFrom="sm" mb={4}>
          <Grid.Col span={3}><Text fz="sm" fw={500}>CNAE</Text></Grid.Col>
          <Grid.Col span={6}><Text fz="sm" fw={500}>{enterprise ? 'Descrição' : 'Descrição (IBGE)'}</Text></Grid.Col>
        </Grid>
      )}
      <Stack gap="sm">
        {list.fields.map((f, i) => (
          <Grid key={f.id} gutter="sm" align="flex-start">
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Controller
                control={control}
                name={`activities.${i}.cnae`}
                render={({ field }) => (
                  <CnaeInput
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    showDescription={false}
                    onResolved={(info) => autoFill(i, info.description)}
                    error={errors?.[i]?.cnae?.message}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              {enterprise ? (
                <Controller
                  control={control}
                  name={`activities.${i}.description`}
                  render={({ field }) => (
                    <TextInput aria-label="Descrição da atividade" placeholder="Descrição da atividade" {...field} value={field.value ?? ''} error={errors?.[i]?.description?.message} />
                  )}
                />
              ) : (
                <IbgeDescription code={values[i]?.cnae ?? ''} />
              )}
            </Grid.Col>
            <Grid.Col span={{ base: 9, sm: 2 }}>
              <Checkbox label="Principal" mt={8} checked={!!values[i]?.isMain} onChange={(e) => setMain(i, e.currentTarget.checked)} />
            </Grid.Col>
            <Grid.Col span={{ base: 3, sm: 1 }}>
              <Tooltip label="Remover">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  mt={4}
                  aria-label="Remover atividade"
                  onClick={() => {
                    const wasMain = values[i]?.isMain;
                    list.remove(i);
                    // Mantém sempre uma principal quando houver atividades
                    if (wasMain && list.fields.length > 1) setValue('activities.0.isMain', true, { shouldDirty: true });
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Grid.Col>
          </Grid>
        ))}
      </Stack>
      {rootError && <Text fz="sm" c="red" mt="sm">{rootError}</Text>}
    </Card>
  );
}
