declare module 'shpjs' {
  /** Lê um .zip com Shapefile(s) e devolve GeoJSON em WGS 84 (reprojeta usando o .prj, se houver). */
  export function parseZip(buffer: ArrayBuffer, whiteList?: string[]): Promise<unknown>;
  const getShapefile: (base: unknown, whiteList?: string[]) => Promise<unknown>;
  export default getShapefile;
}
