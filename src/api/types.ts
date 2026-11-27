/** Tipos das respostas da API (espelham o contrato OpenAPI em /docs/openapi.json). */
import type { Permission, Role } from '../lib/shared';

export type RecordStatus = 'ACTIVE' | 'INACTIVE';
export type PersonType = 'PF' | 'PJ';
export type EnterpriseType = 'INDUSTRIAL_PLANT' | 'BUSINESS_UNIT' | 'FACILITY' | 'RURAL_PROPERTY' | 'URBAN_PROPERTY' | 'OTHER';

export const ENTERPRISE_TYPE_LABELS: Record<EnterpriseType, string> = {
  INDUSTRIAL_PLANT: 'Fábrica / planta industrial',
  BUSINESS_UNIT: 'Unidade / filial',
  FACILITY: 'Instalação',
  RURAL_PROPERTY: 'Propriedade rural',
  URBAN_PROPERTY: 'Imóvel urbano',
  OTHER: 'Outro',
};

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Me {
  user: { id: string; name: string; email: string; isPlatformAdmin: boolean; lastLoginAt: string | null };
  organization: { id: string; name: string; document: string | null };
  role: Role;
  roleLabel: string;
  permissions: Permission[];
  organizations: Array<{ id: string; name: string; role: Role }>;
}

export interface Address {
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface Contact {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isLegalRepresentative: boolean;
  notes: string | null;
}

export interface EnterpriseSummary {
  id: string;
  name: string;
  type: EnterpriseType;
  city: string | null;
  state: string | null;
  status: RecordStatus;
}

export interface Client extends Address {
  id: string;
  type: PersonType;
  name: string;
  tradeName: string | null;
  document: string;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  mainCnae: string | null;
  secondaryCnaes: string[];
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { enterprises: number };
  contacts?: Contact[];
  enterprises?: EnterpriseSummary[];
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface UtmZone {
  zone: number;
  hemisphere: 'N' | 'S';
  epsg: number;
  label: string;
}

export interface Activity {
  id?: string;
  cnae: string | null;
  description: string;
  isMain: boolean;
}

export interface Enterprise extends Address {
  id: string;
  clientId: string;
  name: string;
  code: string | null;
  type: EnterpriseType;
  latitude: number | null;
  longitude: number | null;
  totalAreaM2: number | null;
  builtAreaM2: number | null;
  carNumber: string | null;
  propertyRegistration: string | null;
  registryOffice: string | null;
  ccirNumber: string | null;
  nirfNumber: string | null;
  sigefCode: string | null;
  municipalPropertyRegistration: string | null;
  responsibleUserId: string | null;
  notes: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  utmZone: UtmZone | null;
  client: { id: string; name: string; tradeName: string | null; document: string; type: PersonType };
  responsible: UserSummary | null;
  activities?: Activity[];
  assignments?: Array<{ user: UserSummary }>;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  status: RecordStatus;
  lastLoginAt: string | null;
  memberSince: string;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: UserSummary | null;
}

export interface Organization {
  id: string;
  name: string;
  document: string | null;
  status: RecordStatus;
  createdAt: string;
  _count?: { members?: number; clients: number; enterprises: number };
  members?: Array<{ role: Role; roleLabel: string; status: RecordStatus; createdAt: string; user: UserSummary & { lastLoginAt: string | null } }>;
}

export interface EnterpriseFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { id: string; name: string; status: RecordStatus; clientName: string };
  }>;
}
