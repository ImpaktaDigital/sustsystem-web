import maplibregl from 'maplibre-gl';
import { buildStyle } from '../map/basemaps';
import type { LngLat } from '../lib/geodesy';

/**
 * Renderiza o mapa de fundo da planta fora da tela, no tamanho exato da moldura (mm × dpi), e devolve um JPEG.
 * Os vetores (áreas, símbolos, textos) não entram aqui: são desenhados no PDF, nítidos em qualquer zoom.
 */
export async function renderBasemap(opts: {
  center: LngLat;
  zoom: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  basemap: 'satellite' | 'streets';
  timeoutMs?: number;
}): Promise<Uint8Array> {
  const width = Math.round((opts.widthMm / 25.4) * opts.dpi);
  const height = Math.round((opts.heightMm / 25.4) * opts.dpi);
  const container = document.createElement('div');
  Object.assign(container.style, { position: 'fixed', left: '-100000px', top: '0', width: `${width}px`, height: `${height}px`, pointerEvents: 'none' });
  document.body.appendChild(container);

  const map = new maplibregl.Map({
    container,
    style: buildStyle(opts.basemap),
    center: opts.center,
    zoom: opts.zoom,
    interactive: false,
    attributionControl: false,
    pixelRatio: 1,
    preserveDrawingBuffer: true,
    fadeDuration: 0,
    maxZoom: 24,
    maxCanvasSize: [16384, 16384],
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tempo esgotado ao carregar a imagem de fundo. Verifique a conexão e tente novamente.')), opts.timeoutMs ?? 90_000);
      map.once('error', (e) => console.warn('Mapa de fundo:', e.error?.message));
      map.once('load', () => {
        // "idle" = todas as imagens visíveis carregadas e desenhadas
        if (map.loaded()) { clearTimeout(timer); resolve(); return; }
        map.once('idle', () => { clearTimeout(timer); resolve(); });
      });
    });
    const dataUrl = map.getCanvas().toDataURL('image/jpeg', 0.88);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } finally {
    map.remove();
    container.remove();
  }
}
