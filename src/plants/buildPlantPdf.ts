import { clip, degrees, endPath, PDFDocument, PDFFont, PDFPage, popGraphicsState, pushGraphicsState, rectangle, rgb, StandardFonts, type RGB } from 'pdf-lib';
import type { PlantKind, PlantSnapshotArea, PlantSnapshotElement } from '../api/types';
import { formatHa, segment, type LngLat } from '../lib/geodesy';
import { fromUtm, toDms, toUtm } from '../lib/crs';
import { codeFontSize, shapePath, textOffsetY } from '../lib/symbols';
import { formatAzimuth } from '../pages/editor/VertexTable';
import { frameOf, niceInterval, paperProjection, type Frame, type SheetSize } from './layout';
import { renderBasemap } from './renderMap';

/** Tudo o que é necessário para montar a planta (vem do gerador ou de uma revisão emitida). */
export interface PlantSpec {
  kind: PlantKind;
  title: string;
  revision: number;
  revisionNotes: string | null;
  issueDate: string; // AAAA-MM-DD
  responsibleName: string;
  sheetSize: SheetSize;
  scaleDenominator: number;
  zone: number;
  hemisphere: 'N' | 'S';
  epsg: number;
  basemap: 'satellite' | 'streets';
  center: LngLat;
  organizationName: string;
  enterprise: { name: string; code: string | null; street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; carNumber: string | null; propertyRegistration: string | null; latitude: number | null; longitude: number | null };
  client: { name: string; tradeName: string | null; document: string };
  versionSource: 'validated' | 'current';
  areas: PlantSnapshotArea[];
  elements: PlantSnapshotElement[];
  /** Prévia (não emitida): marca d'água e "PRÉVIA" no campo de revisão. */
  draft: boolean;
}

const PT = 72 / 25.4; // pontos por mm
const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.55, 0.55, 0.55);
const WHITE = rgb(1, 1, 1);

const hex = (color: string): RGB => {
  const h = color.replace('#', '');
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
};

/** Fontes padrão do PDF usam WinAnsi: troca caracteres fora dele. */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const safe = (s: string) =>
  [...s].map((c) => (c.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(c) ? c : c.normalize('NFD').replace(/[^\x00-\xff]/g, '') || '?')).join('');

const nf = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const formatDate = (iso: string) => iso.split('-').reverse().join('/');
const revLabel = (r: number) => `R${String(r).padStart(2, '0')}`;
const openRing = (coords: number[][]) => {
  const r = coords.map(([x, y]) => [x, y] as LngLat);
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  return r;
};

/** Desenho em mm com origem no canto superior esquerdo da folha. */
class Canvas {
  constructor(readonly page: PDFPage, readonly frame: Frame, readonly font: PDFFont, readonly bold: PDFFont) {}
  private y = (mm: number) => (this.frame.height - mm) * PT;

  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; stroke?: RGB; width?: number; opacity?: number } = {}) {
    this.page.drawRectangle({
      x: x * PT, y: this.y(y + h), width: w * PT, height: h * PT,
      color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.width ?? 0.25) * PT : 0, opacity: o.opacity,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { color?: RGB; width?: number; opacity?: number; dash?: number[] } = {}) {
    this.page.drawLine({
      start: { x: x1 * PT, y: this.y(y1) }, end: { x: x2 * PT, y: this.y(y2) },
      thickness: (o.width ?? 0.2) * PT, color: o.color ?? BLACK, opacity: o.opacity, dashArray: o.dash?.map((d) => d * PT),
    });
  }

  /** Texto com y = topo da linha. size em pt. */
  text(s: string, x: number, y: number, size: number, o: { bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right'; maxWidth?: number; rotate?: number; opacity?: number } = {}) {
    const font = o.bold ? this.bold : this.font;
    let t = safe(s);
    if (o.maxWidth) {
      while (t.length > 1 && font.widthOfTextAtSize(t, size) / PT > o.maxWidth) t = `${t.slice(0, -2)}…`;
    }
    const w = font.widthOfTextAtSize(t, size) / PT;
    const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
    const capMm = (size * 0.72) / PT;
    if (o.rotate) {
      this.page.drawText(t, { x: (x + capMm) * PT, y: this.y(y - dx), size, font, color: o.color ?? BLACK, rotate: degrees(o.rotate), opacity: o.opacity });
    } else {
      this.page.drawText(t, { x: (x + dx) * PT, y: this.y(y + capMm), size, font, color: o.color ?? BLACK, opacity: o.opacity });
    }
    return w;
  }

  width(s: string, size: number, bold = false) {
    return (bold ? this.bold : this.font).widthOfTextAtSize(safe(s), size) / PT;
  }

  /** Quebra o texto em linhas que cabem na largura. */
  wrap(s: string, size: number, maxWidth: number, bold = false) {
    const words = safe(s).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (this.width(candidate, size, bold) > maxWidth && line) { lines.push(line); line = w; } else line = candidate;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Texto com fundo branco translúcido (rótulos sobre a imagem). */
  label(s: string, x: number, y: number, size: number, o: { bold?: boolean; align?: 'left' | 'center' | 'right'; color?: RGB } = {}) {
    const w = this.width(s, size, o.bold);
    const h = (size * 0.95) / PT;
    const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
    this.rect(x + dx - 0.6, y - 0.4, w + 1.2, h + 0.6, { fill: WHITE, opacity: 0.82 });
    this.text(s, x, y, size, o);
  }

  /** Caminho SVG (em mm, y para baixo) a partir da origem da folha. Espessuras também em mm (o pdf-lib aplica a escala). */
  path(d: string, o: { fill?: RGB; fillOpacity?: number; stroke?: RGB; width?: number; strokeOpacity?: number; dash?: number[] }) {
    this.page.drawSvgPath(d, {
      x: 0, y: this.frame.height * PT, scale: PT,
      color: o.fill, opacity: o.fill ? o.fillOpacity ?? 1 : undefined,
      borderColor: o.stroke, borderWidth: o.stroke ? (o.width ?? 0.3) : undefined, borderOpacity: o.strokeOpacity,
      borderDashArray: o.dash,
    });
  }

  symbol(shape: PlantSnapshotElement['shape'], color: string, code: string, x: number, y: number, sizeMm: number) {
    this.page.drawSvgPath(shapePath(shape, sizeMm), {
      x: x * PT, y: this.y(y), scale: PT, color: hex(color), borderColor: WHITE, borderWidth: sizeMm * 0.06,
    });
    const fsMm = codeFontSize(code, sizeMm);
    const fsPt = fsMm * PT;
    const w = this.bold.widthOfTextAtSize(safe(code), fsPt) / PT;
    this.page.drawText(safe(code), { x: (x - w / 2) * PT, y: this.y(y + textOffsetY(shape, sizeMm) + fsMm * 0.35), size: fsPt, font: this.bold, color: WHITE });
  }

  clipTo(x: number, y: number, w: number, h: number, draw: () => void) {
    this.page.pushOperators(pushGraphicsState(), rectangle(x * PT, this.y(y + h), w * PT, h * PT), clip(), endPath());
    draw();
    this.page.pushOperators(popGraphicsState());
  }

  /** Linha poligonal em mm (espessura em mm). */
  polyline(points: Array<[number, number]>, o: { color: RGB; width: number; opacity?: number }) {
    if (points.length < 2) return;
    this.path(`M ${points.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join(' L ')}`, { stroke: o.color, width: o.width, strokeOpacity: o.opacity });
  }
}

// ───────────── Quadros (tabelas) ─────────────

interface Table {
  title: string;
  columns: Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>;
  rows: string[][];
}

const ROW_H = 3.6; // mm
const HEADER_H = 4.2;
const TITLE_H = 5;

const tableHeight = (t: Table, rows = t.rows.length) => TITLE_H + HEADER_H + rows * ROW_H + 1;

function drawTable(c: Canvas, t: Table, x: number, y: number, width: number, rows = t.rows, fs = 6) {
  const total = t.columns.reduce((s, col) => s + col.width, 0);
  const k = width / total;
  c.text(t.title, x, y + 0.6, fs + 1, { bold: true, maxWidth: width });
  let cy = y + TITLE_H;
  c.rect(x, cy, width, HEADER_H, { fill: rgb(0.93, 0.93, 0.93), stroke: LINE, width: 0.15 });
  let cx = x;
  for (const col of t.columns) {
    const w = col.width * k;
    c.text(col.label, col.align === 'right' ? cx + w - 0.8 : col.align === 'center' ? cx + w / 2 : cx + 0.8, cy + 1.1, fs, { bold: true, align: col.align, maxWidth: w - 1 });
    cx += w;
  }
  cy += HEADER_H;
  rows.forEach((row, i) => {
    if (i % 2 === 1) c.rect(x, cy, width, ROW_H, { fill: rgb(0.975, 0.975, 0.975) });
    let rx = x;
    t.columns.forEach((col, j) => {
      const w = col.width * k;
      c.text(row[j] ?? '', col.align === 'right' ? rx + w - 0.8 : col.align === 'center' ? rx + w / 2 : rx + 0.8, cy + 0.9, fs, { align: col.align, maxWidth: w - 1 });
      rx += w;
    });
    cy += ROW_H;
  });
  c.rect(x, y + TITLE_H, width, cy - y - TITLE_H, { stroke: LINE, width: 0.15 });
  return cy - y + 1;
}

// ───────────── Montagem ─────────────

const CARIMBO_H: Record<SheetSize, number> = { A4: 50, A3: 54, A2: 58, A1: 62, A0: 66 };

/** Gera o PDF da planta. `onProgress` recebe mensagens para exibir ao usuário. */
export async function buildPlantPdf(spec: PlantSpec, onProgress?: (msg: string) => void): Promise<Uint8Array> {
  const frame = frameOf(spec.sheetSize);
  const proj = paperProjection(spec.center, spec.scaleDenominator, frame.map);
  const fsBase = spec.sheetSize === 'A4' ? 6 : spec.sheetSize === 'A3' ? 6.5 : spec.sheetSize === 'A2' ? 7.5 : 8.5;
  const dpi = spec.sheetSize === 'A0' || spec.sheetSize === 'A1' ? 120 : 150;

  onProgress?.('Carregando a imagem de fundo…');
  const basemapJpeg = await renderBasemap({
    center: spec.center, zoom: proj.zoomForDpi(dpi), widthMm: frame.map.w, heightMm: frame.map.h, dpi, basemap: spec.basemap,
  });
  let inset: Uint8Array | null = null;
  const insetSize = { w: frame.side.w - 4, h: (frame.side.w - 4) * 0.62 };
  const point = spec.enterprise.latitude != null && spec.enterprise.longitude != null ? ([spec.enterprise.longitude, spec.enterprise.latitude] as LngLat) : spec.center;
  if (spec.kind === 'LOCATION') {
    onProgress?.('Carregando o mapa de situação…');
    const insetProj = paperProjection(point, 4_000_000, { x: 0, y: 0, w: insetSize.w, h: insetSize.h });
    inset = await renderBasemap({ center: point, zoom: insetProj.zoomForDpi(150), widthMm: insetSize.w, heightMm: insetSize.h, dpi: 150, basemap: 'streets' });
  }

  onProgress?.('Montando o PDF…');
  const doc = await PDFDocument.create();
  doc.setTitle(`${spec.title} — ${spec.enterprise.name} — ${revLabel(spec.revision)}`);
  doc.setAuthor(spec.responsibleName);
  doc.setCreator('SustSystem');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const bgImage = await doc.embedJpg(basemapJpeg);
  const insetImage = inset ? await doc.embedJpg(inset) : null;

  const areas = [...spec.areas].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const tableAreas = spec.kind === 'DELIMITATION' ? areas.filter((a) => a.vertexTable) : [];
  const prefix = (i: number) => (tableAreas.length > 1 ? String.fromCharCode(65 + i) : 'V');

  // ── Quadros ──
  const areasTable: Table = {
    title: 'QUADRO DE ÁREAS',
    columns: [{ label: 'Área', width: 46 }, { label: 'Superfície (m²)', width: 26, align: 'right' }, { label: 'ha', width: 16, align: 'right' }, { label: 'Perímetro (m)', width: 22, align: 'right' }],
    rows: areas.map((a) => [`${a.name}${spec.versionSource === 'validated' || a.validated ? '' : ' *'}`, nf(a.areaM2), nf(a.areaM2 / 10_000, 4), nf(a.perimeterM)]),
  };
  const vertexTables: Table[] = tableAreas.map((a, i) => {
    const ring = openRing(a.geometry.coordinates[0]);
    return {
      title: `QUADRO DE VÉRTICES — ${a.name.toUpperCase()}`,
      columns: [{ label: 'Vért.', width: 11 }, { label: 'E (m)', width: 22, align: 'right' }, { label: 'N (m)', width: 24, align: 'right' }, { label: 'Lado (m)', width: 17, align: 'right' }, { label: 'Azimute', width: 18, align: 'right' }],
      rows: ring.map((p, j) => {
        const [e, n] = toUtm(p, spec.zone, spec.hemisphere);
        const next = ring[(j + 1) % ring.length];
        const seg = segment(p, next);
        return [`${prefix(i)}${j + 1}`, nf(e, 3), nf(n, 3), nf(seg.distanceM), formatAzimuth(seg.azimuth)];
      }),
    };
  });

  // Distribui os quadros de vértices: o que couber na coluna lateral da folha 1, o resto em folhas adicionais
  const carimboH = CARIMBO_H[spec.sheetSize];
  const sideTop = frame.side.y + 3;
  const legendH = legendHeight(spec, areas);
  const notesLines = notes(spec, areas);
  const notesH = 5 + notesLines.length * 3.2 + 2;
  const insetH = spec.kind === 'LOCATION' ? insetSize.h + 8 : 0;
  const coordsH = spec.kind === 'LOCATION' && spec.enterprise.latitude != null ? 22 : 0;
  const areasTableH = areas.length ? tableHeight(areasTable) + 2 : 0;
  let available = frame.side.h - 3 - legendH - areasTableH - notesH - insetH - coordsH - carimboH - 4;
  const sideTables: Array<{ table: Table; rows: string[][] }> = [];
  const overflow: Array<{ table: Table; rows: string[][] }> = [];
  for (const t of vertexTables) {
    const fitRows = Math.floor((available - TITLE_H - HEADER_H - 3) / ROW_H);
    if (!overflow.length && fitRows >= t.rows.length) {
      sideTables.push({ table: t, rows: t.rows });
      available -= tableHeight(t) + 2;
    } else overflow.push({ table: t, rows: t.rows });
  }

  // Páginas adicionais: colunas de quadros na área do mapa
  const extraPages: Array<Array<{ table: Table; rows: string[][]; x: number; y: number }>> = [];
  if (overflow.length) {
    const colW = 98;
    const cols = Math.max(1, Math.floor((frame.map.w - 6) / (colW + 4)));
    const colH = frame.map.h - 8;
    let page: Array<{ table: Table; rows: string[][]; x: number; y: number }> = [];
    let col = 0;
    let y = frame.map.y + 4;
    for (const { table } of overflow) {
      let remaining = table.rows;
      while (remaining.length) {
        let fit = Math.floor((frame.map.y + 4 + colH - y - TITLE_H - HEADER_H - 2) / ROW_H);
        if (fit < 3) {
          col += 1;
          y = frame.map.y + 4;
          if (col >= cols) { extraPages.push(page); page = []; col = 0; }
          fit = Math.floor((colH - TITLE_H - HEADER_H - 2) / ROW_H);
        }
        const chunk = remaining.slice(0, fit);
        page.push({ table: { ...table, title: remaining === table.rows ? table.title : `${table.title} (continuação)` }, rows: chunk, x: frame.map.x + 3 + col * (colW + 4), y });
        y += tableHeight(table, chunk.length) + 3;
        remaining = remaining.slice(fit);
      }
    }
    if (page.length) extraPages.push(page);
  }
  const totalSheets = 1 + extraPages.length;

  // ── Folha 1 ──
  const page = doc.addPage([frame.width * PT, frame.height * PT]);
  const c = new Canvas(page, frame, font, bold);
  const m = frame.map;
  page.drawImage(bgImage, { x: m.x * PT, y: (frame.height - m.y - m.h) * PT, width: m.w * PT, height: m.h * PT });

  c.clipTo(m.x, m.y, m.w, m.h, () => {
    drawGrid(c, spec, proj, m, fsBase);
    // Áreas: preenchimento e contorno na cor do tipo
    for (const a of areas) {
      const d = a.geometry.coordinates.map((ring) => `M ${ring.map((p) => proj.project(p as LngLat).map((v) => v.toFixed(3)).join(' ')).join(' L ')} Z`).join(' ');
      const color = hex(a.color);
      c.path(d, { fill: color, fillOpacity: spec.kind === 'LOCATION' ? 0.3 : 0.22, stroke: WHITE, width: spec.kind === 'LOCATION' ? 0.8 : 0.6, strokeOpacity: 0.75 });
      c.path(d, { stroke: color, width: spec.kind === 'LOCATION' ? 0.5 : 0.35 });
    }
    // Rótulo da área no centro (se couber)
    for (const a of areas) {
      const pts = openRing(a.geometry.coordinates[0]).map((p) => proj.project(p));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (w > 18 && h > 8 && spec.kind === 'DELIMITATION') {
        const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
        const cy = ys.reduce((s, v) => s + v, 0) / ys.length;
        c.label(a.name, cx, cy - 2, fsBase, { bold: true, align: 'center' });
        c.label(formatHa(a.areaM2), cx, cy + 1.2, fsBase - 0.5, { align: 'center' });
      }
    }
    // Vértices numerados das áreas com quadro
    tableAreas.forEach((a, i) => {
      const ring = openRing(a.geometry.coordinates[0]);
      const pts = ring.map((p) => proj.project(p));
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      pts.forEach(([x, y], j) => {
        c.path(`M ${x - 0.6} ${y} A 0.6 0.6 0 1 0 ${x + 0.6} ${y} A 0.6 0.6 0 1 0 ${x - 0.6} ${y} Z`, { fill: WHITE, stroke: hex(a.color), width: 0.3 });
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const lx = x + (dx / len) * 2.6;
        const ly = y + (dy / len) * 2.6 - 1;
        c.label(`${prefix(i)}${j + 1}`, lx, ly, fsBase - 1, { bold: true, align: dx < 0 ? 'right' : 'left' });
      });
    });
    // Elementos pontuais
    const symMm = spec.sheetSize === 'A4' ? 4 : spec.sheetSize === 'A3' ? 4.5 : 5.5;
    for (const e of spec.elements) {
      const [x, y] = proj.project([e.longitude, e.latitude]);
      c.symbol(e.shape, e.color, e.code, x, y, symMm);
      c.label(e.name, x + symMm * 0.65, y - 1, fsBase - 1, { bold: true });
    }
    // Ponto do empreendimento (planta de localização)
    if (spec.kind === 'LOCATION' && spec.enterprise.latitude != null) {
      const [x, y] = proj.project(point);
      c.path(`M ${x - 1.8} ${y} A 1.8 1.8 0 1 0 ${x + 1.8} ${y} A 1.8 1.8 0 1 0 ${x - 1.8} ${y} Z`, { fill: rgb(0.86, 0.15, 0.15), stroke: WHITE, width: 0.45 });
      c.label(spec.enterprise.name, x + 2.8, y - 1.2, fsBase, { bold: true });
    }
    if (spec.draft) {
      const size = Math.min(m.w, m.h) * 0.22 * PT;
      const len = c.width('PRÉVIA — NÃO EMITIDA', size, true);
      const angle = Math.atan2(m.h, m.w);
      c.text('PRÉVIA — NÃO EMITIDA', m.x + m.w / 2 - (len / 2) * Math.cos(angle), m.y + m.h / 2 + (len / 2) * Math.sin(angle), size, {
        bold: true, color: rgb(0.85, 0.2, 0.2), rotate: (angle * 180) / Math.PI, opacity: 0.28,
      });
    }
  });
  drawNorth(c, m.x + m.w - 14, m.y + 6, fsBase);
  drawScaleBar(c, spec.scaleDenominator, m, fsBase);
  c.rect(m.x, m.y, m.w, m.h, { stroke: BLACK, width: 0.35 });

  // Coluna lateral
  let y = sideTop;
  const sx = frame.side.x + 2;
  const sw = frame.side.w - 4;
  y = drawLegend(c, spec, areas, sx, y, sw, fsBase) + 2;
  if (areas.length) y += drawTable(c, areasTable, sx, y, sw, areasTable.rows, fsBase - 0.5) + 2;
  for (const { table, rows } of sideTables) y += drawTable(c, table, sx, y, sw, rows, fsBase - 0.5) + 2;
  if (overflow.length) {
    c.text(`Quadro(s) de vértices na(s) folha(s) 2${totalSheets > 2 ? ` a ${totalSheets}` : ''}.`, sx, y, fsBase - 0.5, { color: GRAY });
    y += 4;
  }
  if (spec.kind === 'LOCATION' && spec.enterprise.latitude != null) y = drawPointCoords(c, spec, point, sx, y, sw, fsBase) + 2;

  // Notas, situação e carimbo ficam ancorados no rodapé da coluna
  const carimboY = frame.side.y + frame.side.h - carimboH;
  let by = carimboY - notesH;
  drawNotes(c, notesLines, sx, by, sw, fsBase);
  if (insetImage) {
    by -= insetH;
    c.text('SITUAÇÃO', sx, by, fsBase, { bold: true });
    page.drawImage(insetImage, { x: sx * PT, y: (frame.height - by - 4 - insetSize.h) * PT, width: insetSize.w * PT, height: insetSize.h * PT });
    const ip = paperProjection(point, 4_000_000, { x: sx, y: by + 4, w: insetSize.w, h: insetSize.h });
    const [px, py] = ip.project(point);
    c.path(`M ${px - 1.2} ${py} A 1.2 1.2 0 1 0 ${px + 1.2} ${py} A 1.2 1.2 0 1 0 ${px - 1.2} ${py} Z`, { fill: rgb(0.86, 0.15, 0.15), stroke: WHITE, width: 0.3 });
    c.rect(sx, by + 4, insetSize.w, insetSize.h, { stroke: BLACK, width: 0.2 });
  }
  c.line(frame.side.x, frame.side.y, frame.side.x, frame.side.y + frame.side.h, { width: 0.35 });
  drawCarimbo(c, spec, frame, carimboY, carimboH, 1, totalSheets, fsBase);
  c.rect(frame.inner.x, frame.inner.y, frame.inner.w, frame.inner.h, { stroke: BLACK, width: 0.5 });

  // ── Folhas adicionais (quadros de vértices) ──
  extraPages.forEach((items, i) => {
    const p = doc.addPage([frame.width * PT, frame.height * PT]);
    const cc = new Canvas(p, frame, font, bold);
    for (const it of items) drawTable(cc, it.table, it.x, it.y, 98, it.rows, fsBase - 0.5);
    cc.line(frame.side.x, frame.side.y, frame.side.x, frame.side.y + frame.side.h, { width: 0.35 });
    drawNotes(cc, notesLines, sx, frame.side.y + frame.side.h - carimboH - notesH, sw, fsBase);
    drawCarimbo(cc, spec, frame, frame.side.y + frame.side.h - carimboH, carimboH, i + 2, totalSheets, fsBase);
    cc.rect(frame.inner.x, frame.inner.y, frame.inner.w, frame.inner.h, { stroke: BLACK, width: 0.5 });
  });

  return doc.save();
}

// ───────────── Componentes ─────────────

function legendItems(spec: PlantSpec, areas: PlantSnapshotArea[]) {
  const types = new Map<string, string>();
  areas.forEach((a) => types.set(a.typeName, a.color));
  const elTypes = new Map<string, PlantSnapshotElement>();
  [...spec.elements].sort((a, b) => a.sortOrder - b.sortOrder).forEach((e) => elTypes.set(e.typeId, e));
  return { types: [...types.entries()], elements: [...elTypes.values()] };
}

function legendHeight(spec: PlantSpec, areas: PlantSnapshotArea[]) {
  const { types, elements } = legendItems(spec, areas);
  const extra = (spec.kind === 'LOCATION' ? 1 : 0) + (spec.kind === 'DELIMITATION' && areas.some((a) => a.vertexTable) ? 1 : 0);
  return 6 + (types.length + elements.length + extra) * 4.2 + 1;
}

function drawLegend(c: Canvas, spec: PlantSpec, areas: PlantSnapshotArea[], x: number, y: number, w: number, fs: number) {
  const { types, elements } = legendItems(spec, areas);
  c.text('LEGENDA', x, y, fs + 1, { bold: true });
  let cy = y + 6;
  for (const [name, color] of types) {
    c.rect(x, cy - 0.2, 6, 3, { fill: hex(color), opacity: 0.45 });
    c.rect(x, cy - 0.2, 6, 3, { stroke: hex(color), width: 0.35 });
    c.text(name, x + 8, cy + 0.3, fs, { maxWidth: w - 8 });
    cy += 4.2;
  }
  for (const e of elements) {
    c.symbol(e.shape, e.color, e.code, x + 3, cy + 1.3, 3.8);
    c.text(e.typeName, x + 8, cy + 0.3, fs, { maxWidth: w - 8 });
    cy += 4.2;
  }
  if (spec.kind === 'DELIMITATION' && areas.some((a) => a.vertexTable)) {
    c.path(`M ${x + 2.4} ${cy + 1.3} A 0.7 0.7 0 1 0 ${x + 3.8} ${cy + 1.3} A 0.7 0.7 0 1 0 ${x + 2.4} ${cy + 1.3} Z`, { fill: WHITE, stroke: BLACK, width: 0.3 });
    c.text('Vértice (ver quadro de vértices)', x + 8, cy + 0.3, fs, { maxWidth: w - 8 });
    cy += 4.2;
  }
  if (spec.kind === 'LOCATION') {
    c.path(`M ${x + 1.8} ${cy + 1.3} A 1.2 1.2 0 1 0 ${x + 4.2} ${cy + 1.3} A 1.2 1.2 0 1 0 ${x + 1.8} ${cy + 1.3} Z`, { fill: rgb(0.86, 0.15, 0.15), stroke: BLACK, width: 0.2 });
    c.text('Localização do empreendimento', x + 8, cy + 0.3, fs, { maxWidth: w - 8 });
    cy += 4.2;
  }
  return cy;
}

function drawPointCoords(c: Canvas, spec: PlantSpec, point: LngLat, x: number, y: number, w: number, fs: number) {
  const [e, n] = toUtm(point, spec.zone, spec.hemisphere);
  c.text('COORDENADAS DO EMPREENDIMENTO', x, y, fs + 1, { bold: true, maxWidth: w });
  const lines = [
    `E ${nf(e, 2)} m  ·  N ${nf(n, 2)} m (UTM ${spec.zone}${spec.hemisphere})`,
    `Lat ${toDms(point[1], 'lat')}  ·  Long ${toDms(point[0], 'lng')}`,
    `Lat ${nf(point[1], 6)}°  ·  Long ${nf(point[0], 6)}°`,
  ];
  lines.forEach((l, i) => c.text(l, x, y + 5.5 + i * 3.6, fs - 0.3, { maxWidth: w }));
  return y + 5.5 + lines.length * 3.6;
}

function notes(spec: PlantSpec, areas: PlantSnapshotArea[]) {
  const list = [
    `Sistema de referência: SIRGAS 2000 / UTM zona ${spec.zone}${spec.hemisphere} (EPSG:${spec.epsg}). Coordenadas planas UTM.`,
    'Áreas, perímetros, lados e azimutes calculados no elipsoide (geodésicos).',
    `Imagem de fundo: ${spec.basemap === 'satellite' ? 'Esri World Imagery (data de captura variável)' : '© colaboradores do OpenStreetMap'}.`,
  ];
  if (areas.some((a) => !a.validated)) list.push('* Área em versão ainda não validada tecnicamente.');
  else if (areas.length) list.push('Áreas na última versão validada tecnicamente.');
  if (spec.enterprise.carNumber) list.push(`CAR: ${spec.enterprise.carNumber}`);
  if (spec.enterprise.propertyRegistration) list.push(`Matrícula: ${spec.enterprise.propertyRegistration}`);
  return list;
}

function drawNotes(c: Canvas, lines: string[], x: number, y: number, w: number, fs: number) {
  c.text('NOTAS', x, y, fs, { bold: true });
  let cy = y + 4.5;
  for (const l of lines) {
    for (const part of c.wrap(l, fs - 1, w)) { c.text(part, x, cy, fs - 1, { color: GRAY }); cy += 3.2; }
  }
}

function drawCarimbo(c: Canvas, spec: PlantSpec, frame: Frame, y: number, h: number, sheetN: number, sheets: number, fs: number) {
  const x = frame.side.x;
  const w = frame.side.w;
  const rows = [0.17, 0.15, 0.14, 0.13, 0.14, 0.14, 0.13]; // proporções das linhas
  const ys: number[] = [];
  let acc = y;
  for (const r of rows) { ys.push(acc); acc += r * h; }
  const cell = (label: string, value: string, cx: number, cy: number, cw: number, ch: number, o: { bold?: boolean; size?: number } = {}) => {
    c.rect(cx, cy, cw, ch, { stroke: BLACK, width: 0.2 });
    c.text(label, cx + 1, cy + 0.9, fs - 2, { color: GRAY });
    const size = o.size ?? fs;
    const lines = c.wrap(value, size, cw - 2, o.bold).slice(0, 2);
    lines.forEach((l, i) => c.text(l, cx + 1, cy + 3.4 + i * (size / PT) * 1.15, size, { bold: o.bold, maxWidth: cw - 2 }));
  };
  const rh = (i: number) => rows[i] * h;
  c.rect(x, y, w, h, { fill: WHITE });
  cell('Escritório', spec.organizationName, x, ys[0], w, rh(0), { bold: true, size: fs + 0.5 });
  cell('Título', spec.title.toUpperCase(), x, ys[1], w, rh(1), { bold: true, size: fs + 1 });
  cell('Empreendimento', spec.enterprise.name + (spec.enterprise.code ? ` (${spec.enterprise.code})` : ''), x, ys[2], w, rh(2));
  cell('Cliente', spec.client.tradeName || spec.client.name, x, ys[3], w, rh(3));
  const local = [[spec.enterprise.street, spec.enterprise.number].filter(Boolean).join(', '), spec.enterprise.district, [spec.enterprise.city, spec.enterprise.state].filter(Boolean).join('/')].filter(Boolean).join(' — ');
  cell('Local', local || '—', x, ys[4], w, rh(4));
  cell('Responsável técnico', spec.responsibleName, x, ys[5], w * 0.68, rh(5), { bold: true });
  cell('Data', formatDate(spec.issueDate), x + w * 0.68, ys[5], w * 0.32, rh(5));
  cell('Escala', `1:${spec.scaleDenominator.toLocaleString('pt-BR')}`, x, ys[6], w * 0.3, rh(6), { bold: true });
  cell('Folha', `${spec.sheetSize} — ${sheetN}/${sheets}`, x + w * 0.3, ys[6], w * 0.3, rh(6));
  cell('Revisão', spec.draft ? `PRÉVIA (${revLabel(spec.revision)})` : `${revLabel(spec.revision)}${spec.revisionNotes ? ` — ${spec.revisionNotes}` : ''}`, x + w * 0.6, ys[6], w * 0.4, rh(6), { bold: true, size: fs - 0.5 });
}

function drawNorth(c: Canvas, x: number, y: number, fs: number) {
  c.rect(x, y, 8, 12, { fill: WHITE, opacity: 0.85 });
  c.path(`M ${x + 4} ${y + 1.5} L ${x + 6.5} ${y + 9} L ${x + 4} ${y + 7.4} Z`, { fill: BLACK });
  c.path(`M ${x + 4} ${y + 1.5} L ${x + 1.5} ${y + 9} L ${x + 4} ${y + 7.4} Z`, { fill: WHITE, stroke: BLACK, width: 0.2 });
  c.text('N', x + 4, y + 9.3, fs + 0.5, { bold: true, align: 'center' });
}

function drawScaleBar(c: Canvas, scale: number, m: Frame['map'], fs: number) {
  const totalM = niceInterval((m.w * 0.22 * scale) / 1000);
  const lenMm = (totalM * 1000) / scale;
  const x = m.x + 4;
  const y = m.y + m.h - 13;
  const unit = totalM >= 1000 ? 'km' : 'm';
  const fmt = (v: number) => (unit === 'km' ? nf(v / 1000, v % 1000 ? 1 : 0) : nf(v, v % 1 ? 1 : 0));
  c.rect(x - 2, y - 2, lenMm + 16, 11, { fill: WHITE, opacity: 0.88 });
  for (let i = 0; i < 4; i++) c.rect(x + (i * lenMm) / 4, y + 3, lenMm / 4, 1.4, { fill: i % 2 ? WHITE : BLACK, stroke: BLACK, width: 0.15 });
  [0, 2, 4].forEach((i) => c.text(fmt((totalM * i) / 4), x + (i * lenMm) / 4, y - 0.4, fs - 1.5, { align: 'center' }));
  c.text(unit, x + lenMm + 2.5, y + 2.6, fs - 1);
  c.text(`Escala 1:${scale.toLocaleString('pt-BR')}`, x, y + 5.6, fs - 1, { bold: true });
}

/** Grade de coordenadas UTM com rótulos nas bordas da moldura. */
function drawGrid(c: Canvas, spec: PlantSpec, proj: ReturnType<typeof paperProjection>, m: Frame['map'], fs: number) {
  const corners = [[m.x, m.y], [m.x + m.w, m.y], [m.x, m.y + m.h], [m.x + m.w, m.y + m.h]].map((p) => toUtm(proj.unproject(p as [number, number]), spec.zone, spec.hemisphere));
  const minE = Math.min(...corners.map((p) => p[0]));
  const maxE = Math.max(...corners.map((p) => p[0]));
  const minN = Math.min(...corners.map((p) => p[1]));
  const maxN = Math.max(...corners.map((p) => p[1]));
  const step = niceInterval(((m.w * spec.scaleDenominator) / 1000) / 5);
  const toMm = (e: number, n: number) => proj.project(fromUtm(e, n, spec.zone, spec.hemisphere));
  const color = spec.basemap === 'satellite' ? WHITE : rgb(0.35, 0.35, 0.35);
  const fmt = (v: number) => Math.round(v).toLocaleString('pt-BR');
  for (let e = Math.ceil(minE / step) * step; e <= maxE; e += step) {
    const pts = Array.from({ length: 11 }, (_, i) => toMm(e, minN + ((maxN - minN) * i) / 10));
    c.polyline(pts, { color, width: 0.12, opacity: 0.6 });
    const top = pts.reduce((a, b) => (Math.abs(b[1] - m.y) < Math.abs(a[1] - m.y) ? b : a));
    if (top[0] > m.x + 8 && top[0] < m.x + m.w - 22) c.label(`E ${fmt(e)}`, top[0], m.y + 0.8, fs - 1.5, { align: 'center' });
  }
  for (let n = Math.ceil(minN / step) * step; n <= maxN; n += step) {
    const pts = Array.from({ length: 11 }, (_, i) => toMm(minE + ((maxE - minE) * i) / 10, n));
    c.polyline(pts, { color, width: 0.12, opacity: 0.6 });
    const left = pts.reduce((a, b) => (Math.abs(b[0] - m.x) < Math.abs(a[0] - m.x) ? b : a));
    if (left[1] > m.y + 10 && left[1] < m.y + m.h - 18) c.label(`N ${fmt(n)}`, m.x + 0.8, left[1] - 1, fs - 1.5);
  }
}
