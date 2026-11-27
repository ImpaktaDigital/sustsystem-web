import { onlyDigits } from './shared';

/**
 * Geocodificação de endereço → coordenadas com o Nominatim (OpenStreetMap), serviço público e gratuito.
 * Política de uso: no máximo 1 requisição por segundo e sem uso em massa — por isso as tentativas são
 * sequenciais, espaçadas e disparadas só depois que o usuário para de digitar.
 * Para volume maior, basta trocar a URL por uma instância própria ou um provedor comercial.
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export type GeocodePrecision = 'number' | 'street' | 'postcode' | 'city';

export const PRECISION_LABELS: Record<GeocodePrecision, string> = {
  number: 'número do endereço',
  street: 'logradouro',
  postcode: 'CEP',
  city: 'município',
};

/** Zoom sugerido para cada precisão. */
export const PRECISION_ZOOM: Record<GeocodePrecision, number> = { number: 18, street: 17, postcode: 15, city: 12 };

export interface AddressInput {
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  precision: GeocodePrecision;
  label: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  place_rank?: number;
  type?: string;
  addresstype?: string;
  display_name: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(params: Record<string, string>, signal?: AbortSignal): Promise<NominatimItem | null> {
  const url = new URL(NOMINATIM_URL);
  url.search = new URLSearchParams({ format: 'jsonv2', countrycodes: 'br', limit: '1', 'accept-language': 'pt-BR', ...params }).toString();
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
  const [first] = (await res.json()) as NominatimItem[];
  return first ?? null;
}

const precisionOf = (item: NominatimItem, fallback: GeocodePrecision): GeocodePrecision => {
  const rank = item.place_rank ?? 0;
  if (item.type === 'postcode' || item.addresstype === 'postcode') return 'postcode';
  if (rank >= 30) return 'number';
  if (rank >= 26) return 'street';
  return fallback === 'number' || fallback === 'street' ? 'city' : fallback;
};

/** Chave estável do endereço (evita consultar de novo o mesmo endereço). */
export function addressKey(a: AddressInput) {
  return [a.street, a.number, a.district, a.city, a.state, onlyDigits(a.zipCode ?? '')].map((v) => (v ?? '').trim().toLowerCase()).join('|');
}

/** Há dados suficientes para tentar localizar? (município + UF, ou CEP completo) */
export function canGeocode(a: AddressInput) {
  return (!!a.city?.trim() && !!a.state) || onlyDigits(a.zipCode ?? '').length === 8;
}

/**
 * Tenta do mais preciso ao menos preciso: logradouro + número → CEP → município.
 * Retorna null se nada for encontrado.
 */
export async function geocodeAddress(a: AddressInput, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const state = a.state ? UF_NAMES[a.state] ?? a.state : undefined;
  const city = a.city?.trim();
  const street = a.street?.trim();
  const cep = onlyDigits(a.zipCode ?? '');
  const attempts: Array<{ params: Record<string, string>; precision: GeocodePrecision }> = [];

  if (street && city && state) {
    const number = a.number?.trim().replace(/^s\/?n$/i, '');
    attempts.push({ params: { street: [number, street].filter(Boolean).join(' '), city, state }, precision: number ? 'number' : 'street' });
  }
  if (cep.length === 8) attempts.push({ params: { postalcode: `${cep.slice(0, 5)}-${cep.slice(5)}` }, precision: 'postcode' });
  if (city && state) attempts.push({ params: { city, state }, precision: 'city' });

  for (const [i, attempt] of attempts.entries()) {
    if (i > 0) await wait(1100); // respeita o limite de 1 req/s
    if (signal?.aborted) return null;
    const item = await search(attempt.params, signal);
    if (item) {
      return {
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        precision: attempt.precision === 'postcode' || attempt.precision === 'city' ? attempt.precision : precisionOf(item, attempt.precision),
        label: item.display_name,
      };
    }
  }
  return null;
}
