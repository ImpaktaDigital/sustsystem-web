import { z } from 'zod';

/** Mesma regra da API: mínimo 8 caracteres, com letras e números. */
export const passwordSchema = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
  .regex(/\d/, 'Inclua ao menos um número');

export const PASSWORD_HINT = 'Mínimo de 8 caracteres, com letras e números';
