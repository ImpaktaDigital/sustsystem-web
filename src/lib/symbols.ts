/**
 * Símbolos de elementos pontuais: forma + sigla + cor. A mesma geometria é usada no mapa (SVG) e na planta (PDF),
 * no estilo das plantas técnicas (ex.: triângulo vermelho "PQS" para extintor).
 */
export type SymbolShape = 'CIRCLE' | 'SQUARE' | 'TRIANGLE' | 'DIAMOND' | 'HEXAGON';

export const SHAPE_LABELS: Record<SymbolShape, string> = {
  CIRCLE: 'Círculo',
  SQUARE: 'Quadrado',
  TRIANGLE: 'Triângulo',
  DIAMOND: 'Losango',
  HEXAGON: 'Hexágono',
};

/** Caminho SVG da forma, centrado em (0,0), cabendo num quadrado de lado `size` (eixo y para baixo). */
export function shapePath(shape: SymbolShape, size: number) {
  const r = size / 2;
  const poly = (pts: Array<[number, number]>) => `M ${pts.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join(' L ')} Z`;
  switch (shape) {
    case 'SQUARE':
      return poly([[-r * 0.88, -r * 0.88], [r * 0.88, -r * 0.88], [r * 0.88, r * 0.88], [-r * 0.88, r * 0.88]]);
    case 'TRIANGLE':
      return poly([[0, -r], [r, r * 0.8], [-r, r * 0.8]]);
    case 'DIAMOND':
      return poly([[0, -r], [r, 0], [0, r], [-r, 0]]);
    case 'HEXAGON':
      return poly(Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
      }));
    default: {
      // Círculo com dois arcos
      return `M ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 Z`;
    }
  }
}

/** Deslocamento vertical do texto para ficar centrado visualmente (triângulo tem o centro mais baixo). */
export const textOffsetY = (shape: SymbolShape, size: number) => (shape === 'TRIANGLE' ? size * 0.2 : 0);

/** Tamanho da fonte da sigla conforme a quantidade de caracteres. */
export const codeFontSize = (code: string, size: number) => size * (code.length <= 1 ? 0.5 : code.length === 2 ? 0.4 : code.length === 3 ? 0.3 : 0.25);

/** SVG completo (para marcadores no mapa e ícones na interface). */
export function symbolSvg(shape: SymbolShape, color: string, code: string, size = 26) {
  const half = size / 2;
  const fs = codeFontSize(code, size);
  const ty = textOffsetY(shape, size) + fs * 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-half - 1} ${-half - 1} ${size + 2} ${size + 2}">`
    + `<path d="${shapePath(shape, size)}" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<text x="0" y="${ty.toFixed(2)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fs.toFixed(2)}" fill="#ffffff">${code.replace(/[<&>]/g, '')}</text>`
    + '</svg>';
}
