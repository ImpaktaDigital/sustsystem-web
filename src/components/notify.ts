import { notifications } from '@mantine/notifications';
import { ApiError } from '../api/client';

export const notifySuccess = (message: string) => notifications.show({ color: 'forest', message, autoClose: 3500 });

export const notifyError = (error: unknown, fallback = 'Não foi possível concluir a operação') =>
  notifications.show({
    color: 'red',
    title: 'Atenção',
    message: error instanceof ApiError ? error.message : fallback,
    autoClose: 6000,
  });
