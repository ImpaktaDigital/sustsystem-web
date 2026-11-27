import { Alert, Button, Checkbox, FileInput, Group, Modal, ScrollArea, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconFileImport } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { AreaType } from '../../api/types';
import { UTM_ZONES } from '../../lib/crs';
import { formatHa, polygonMetrics, type LngLat } from '../../lib/geodesy';
import { ACCEPTED_EXTENSIONS, readGeoFile, toLngLatRings, type ImportResult } from '../../lib/geoimport';

export interface ImportItem {
  name: string;
  areaTypeId: string;
  rings: LngLat[][];
  coordinateSystem: string;
}

interface Row {
  include: boolean;
  name: string;
  areaTypeId: string | null;
}

/** Sugere o tipo pelo nome da feição (ex.: "APP", "Reserva legal", "construída"). */
function guessType(name: string, types: AreaType[]) {
  const n = name.toLowerCase();
  const rules: Array<[RegExp, RegExp]> = [
    [/\bapp\b|preserva/, /APP|Preserva/],
    [/reserva|\brl\b/, /Reserva/],
    [/constru|edifica|galp/, /constru/i],
    [/hídric|hidric|rio|lago|represa|alag/, /hídrico/i],
    [/degrad|prad/, /degradada/i],
    [/servid/, /servidão/i],
    [/lavra|anm|miner/, /miner/i],
    [/res[íi]duo/, /resíduos/i],
    [/consolid/, /consolidado/i],
    [/vegeta|remanesc/, /vegetação/i],
    [/total|per[íi]metro|im[óo]vel|limite/, /total/i],
  ];
  for (const [nameRule, typeRule] of rules) {
    if (nameRule.test(n)) {
      const t = types.find((x) => typeRule.test(x.name));
      if (t) return t.id;
    }
  }
  return types[0]?.id ?? null;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  types: AreaType[];
  defaultZone: { zone: number; hemisphere: 'N' | 'S' };
  onImport: (items: ImportItem[]) => Promise<void>;
}

/** Importação de GeoJSON, KML, KMZ e Shapefile (RF31 / US54), com prévia e escolha do tipo de cada área. */
export function ImportModal({ opened, onClose, types, defaultZone, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [zone, setZone] = useState(defaultZone);

  useEffect(() => {
    if (!opened) { setFile(null); setResult(null); setError(null); setRows([]); }
  }, [opened]);
  useEffect(() => setZone({ zone: defaultZone.zone, hemisphere: defaultZone.hemisphere }), [defaultZone.zone, defaultZone.hemisphere]);

  const read = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
    if (!f) return;
    setReading(true);
    try {
      const r = await readGeoFile(f);
      if (!r.polygons.length) throw new Error('Nenhum polígono encontrado no arquivo');
      setResult(r);
      if (r.detectedUtm) setZone(r.detectedUtm);
      setRows(r.polygons.map((p) => ({ include: true, name: p.name, areaTypeId: guessType(p.name, types) })));
    } catch (e) {
      setError((e as Error).message);
    }
    setReading(false);
  };

  const utm = result?.projected ? zone : undefined;
  const converted = useMemo(() => {
    if (!result) return [];
    return result.polygons.map((p) => {
      try {
        const rings = toLngLatRings(p, utm);
        const ok = rings[0].length >= 3 && rings.every((r) => r.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90));
        return { rings, ok, areaM2: ok ? polygonMetrics(rings[0]).areaM2 : 0 };
      } catch {
        return { rings: [], ok: false, areaM2: 0 };
      }
    });
  }, [result, utm]);

  const selected = rows.map((r, i) => ({ ...r, conv: converted[i] })).filter((r) => r.include && r.conv?.ok);
  const missingType = selected.some((r) => !r.areaTypeId || !r.name.trim());
  const crsName = utm ? `EPSG:${utm.hemisphere === 'N' ? 31954 + utm.zone : 31960 + utm.zone}` : 'EPSG:4326';

  const submit = async () => {
    setSaving(true);
    try {
      await onImport(selected.map((r) => ({ name: r.name.trim(), areaTypeId: r.areaTypeId!, rings: r.conv.rings, coordinateSystem: crsName })));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const typeOptions = types.map((t) => ({ value: t.id, label: t.name }));
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal opened={opened} onClose={onClose} title="Importar arquivo geográfico" size="xl">
      <Stack>
        <FileInput
          label="Arquivo"
          description="GeoJSON, KML, KMZ ou Shapefile compactado (.zip com .shp, .dbf e .prj)"
          placeholder="Selecione o arquivo"
          accept={ACCEPTED_EXTENSIONS}
          value={file}
          onChange={read}
          leftSection={<IconFileImport size={16} />}
          clearable
        />
        {reading && <Text fz="sm" c="dimmed">Lendo arquivo…</Text>}
        {error && <Alert color="red" variant="light">{error}</Alert>}
        {result && (
          <>
            <Text fz="sm">
              <b>{result.polygons.length}</b> polígono(s) encontrado(s) no {result.format}.
              {result.ignored.points + result.ignored.lines > 0 && ` Ignorados: ${result.ignored.points} ponto(s) e ${result.ignored.lines} linha(s) abertas.`}
            </Text>
            {result.projected && (
              <Alert color={result.detectedUtm ? 'slateBlue' : 'yellow'} variant="light">
                <Stack gap="xs">
                  <Text fz="sm">
                    {result.detectedUtm
                      ? 'As coordenadas estão em UTM; a zona foi lida do arquivo. Confira:'
                      : 'As coordenadas estão em metros (provavelmente UTM) e o arquivo não informa a projeção. Selecione a zona SIRGAS 2000:'}
                  </Text>
                  <Group gap="xs">
                    <Select size="xs" w={110} aria-label="Zona UTM" data={UTM_ZONES.map((z) => ({ value: String(z), label: `Zona ${z}` }))} value={String(zone.zone)} onChange={(v) => v && setZone({ ...zone, zone: Number(v) })} allowDeselect={false} />
                    <Select size="xs" w={140} aria-label="Hemisfério" data={[{ value: 'S', label: 'Hemisfério Sul' }, { value: 'N', label: 'Hemisfério Norte' }]} value={zone.hemisphere} onChange={(v) => v && setZone({ ...zone, hemisphere: v as 'N' | 'S' })} allowDeselect={false} />
                  </Group>
                </Stack>
              </Alert>
            )}
            <ScrollArea.Autosize mah={360}>
              <Table verticalSpacing={4} fz="sm">
                <Table.Thead>
                  <Table.Tr><Table.Th w={30} /><Table.Th>Nome</Table.Th><Table.Th>Tipo de área</Table.Th><Table.Th ta="right">Área</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((r, i) => (
                    <Table.Tr key={i} opacity={converted[i]?.ok ? 1 : 0.5}>
                      <Table.Td><Checkbox aria-label={`Importar ${r.name}`} checked={r.include && !!converted[i]?.ok} disabled={!converted[i]?.ok} onChange={(e) => update(i, { include: e.currentTarget.checked })} /></Table.Td>
                      <Table.Td><TextInput size="xs" aria-label="Nome da área" value={r.name} onChange={(e) => update(i, { name: e.currentTarget.value })} /></Table.Td>
                      <Table.Td><Select size="xs" aria-label="Tipo de área" data={typeOptions} value={r.areaTypeId} onChange={(v) => update(i, { areaTypeId: v })} searchable /></Table.Td>
                      <Table.Td ta="right" ff="monospace">{converted[i]?.ok ? formatHa(converted[i].areaM2) : 'inválido'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </>
        )}
        <Group justify="space-between">
          <Text fz="xs" c="dimmed">Cada polígono vira uma área com a versão V1 (método: importação de arquivo).</Text>
          <Group>
            <Button variant="default" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} loading={saving} disabled={!selected.length || missingType}>
              Importar {selected.length || ''} área(s)
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
