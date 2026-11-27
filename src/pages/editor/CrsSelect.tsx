import { Group, Select } from '@mantine/core';
import { UTM_ZONES, type Crs, type CrsKind } from '../../lib/crs';

/** Seleção do sistema de coordenadas: geográficas (decimal/GMS) ou UTM SIRGAS 2000 com zona. */
export function CrsSelect({ value, onChange, label, size = 'xs' }: { value: Crs; onChange: (crs: Crs) => void; label?: string; size?: 'xs' | 'sm' }) {
  return (
    <Group gap={6} align="flex-end" wrap="nowrap">
      <Select
        size={size}
        label={label}
        aria-label="Sistema de coordenadas"
        w={200}
        allowDeselect={false}
        data={[
          { value: 'utm', label: 'UTM (SIRGAS 2000)' },
          { value: 'geo', label: 'Geográficas — graus decimais' },
          { value: 'dms', label: 'Geográficas — GMS' },
        ]}
        value={value.kind}
        onChange={(v) => v && onChange({ ...value, kind: v as CrsKind, zone: value.zone ?? 23, hemisphere: value.hemisphere ?? 'S' })}
      />
      {value.kind === 'utm' && (
        <Select
          size={size}
          aria-label="Zona UTM"
          w={92}
          allowDeselect={false}
          data={UTM_ZONES.flatMap((z) => [{ value: `${z}S`, label: `${z}S` }, ...(z <= 22 ? [{ value: `${z}N`, label: `${z}N` }] : [])])}
          value={`${value.zone}${value.hemisphere}`}
          onChange={(v) => v && onChange({ ...value, zone: Number(v.slice(0, -1)), hemisphere: v.slice(-1) as 'N' | 'S' })}
        />
      )}
    </Group>
  );
}
