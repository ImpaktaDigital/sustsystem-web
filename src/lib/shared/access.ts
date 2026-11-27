/**
 * Perfis e permissões.
 *
 * O documento (seção 3) recomenda permissões configuráveis, não presas a papéis fixos.
 * Nesta fase as permissões são granulares e os papéis são apenas "pacotes padrão" delas;
 * a configuração por organização (tabelas roles/permissions) entra numa etapa posterior
 * sem mudar a forma como o código verifica acesso (sempre por permissão).
 */

export const ROLES = ['ADMIN', 'MANAGER', 'ENGINEER', 'FIELD_TECH', 'CLIENT'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor de projetos',
  ENGINEER: 'Engenheiro / Responsável técnico',
  FIELD_TECH: 'Técnico de campo',
  CLIENT: 'Cliente',
};

export const PERMISSIONS = [
  'organization.manage',
  'users.read',
  'users.manage',
  'clients.read',
  'clients.write',
  /** Consultar empreendimentos (sem `read_all`, apenas os atribuídos ou sob sua responsabilidade). */
  'enterprises.read',
  /** Consultar todos os empreendimentos da organização. */
  'enterprises.read_all',
  'enterprises.write',
  /** Atribuir membros da equipe a empreendimentos. */
  'enterprises.assign',
  /** Desenhar, importar e editar áreas (novas versões) dos empreendimentos visíveis. */
  'areas.write',
  /** Validar versão de área (revisão técnica) — a versão validada alimenta a planta. */
  'areas.validate',
  /** Configurar os tipos de área e de elemento pontual da organização. */
  'area_types.manage',
  /** Emitir revisões de planta (PDF) com responsável técnico. */
  'plants.issue',
  /** Fazer levantamentos no app de campo (inclusive com pré-cadastro, antes de existir o empreendimento). */
  'surveys.collect',
  /** Triar, vincular e aprovar levantamentos recebidos do app. */
  'surveys.review',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: [
    'users.read', 'clients.read', 'clients.write',
    'enterprises.read', 'enterprises.read_all', 'enterprises.write', 'enterprises.assign',
    'areas.write', 'area_types.manage', 'plants.issue', 'surveys.collect', 'surveys.review', 'audit.read',
  ],
  ENGINEER: ['users.read', 'clients.read', 'enterprises.read', 'enterprises.read_all', 'enterprises.write', 'areas.write', 'areas.validate', 'plants.issue',
    'surveys.collect', 'surveys.review'],
  FIELD_TECH: ['enterprises.read', 'areas.write', 'surveys.collect'],
  CLIENT: [],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}
