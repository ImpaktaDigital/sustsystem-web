import type { PlantRecord } from '../api/types';
import type { PlantSpec } from './buildPlantPdf';
import type { SheetSize } from './layout';

/** Especificação de uma revisão já emitida (gera o mesmo PDF da emissão). */
export function specFromRecord(p: PlantRecord): PlantSpec {
  return {
    kind: p.kind,
    title: p.title,
    revision: p.revision,
    revisionNotes: p.revisionNotes,
    issueDate: p.issueDate.slice(0, 10),
    responsibleName: p.responsibleName,
    sheetSize: p.sheetSize as SheetSize,
    scaleDenominator: p.scaleDenominator,
    zone: p.layout.zone,
    hemisphere: p.layout.hemisphere,
    epsg: p.crsEpsg,
    basemap: p.layout.basemap,
    center: p.layout.center,
    organizationName: p.snapshot.organization.name,
    enterprise: p.snapshot.enterprise,
    client: p.snapshot.client,
    versionSource: p.snapshot.versionSource,
    areas: p.snapshot.areas,
    elements: p.snapshot.elements,
    draft: false,
  };
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export function plantFileName(spec: Pick<PlantSpec, 'kind' | 'revision' | 'enterprise' | 'draft'>) {
  const kind = spec.kind === 'LOCATION' ? 'planta-localizacao' : 'planta-delimitacao';
  return `${slug(spec.enterprise.name)}-${kind}-${spec.draft ? 'previa' : `R${String(spec.revision).padStart(2, '0')}`}.pdf`;
}

/** Dispara o download do PDF no navegador. */
export function savePdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
