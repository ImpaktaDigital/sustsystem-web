import { describe, expect, it } from 'vitest';
import { formatPair, fromUtm, parseAngle, parseCoordinateList, parseNumber, parsePair, toDms, toUtm } from './crs';
import { lineLength, polygonMetrics, type LngLat } from './geodesy';

const campinas: LngLat = [-47.0608, -22.9056];

describe('sistemas de coordenadas', () => {
  it('UTM SIRGAS 2000 ida e volta (zona 23S)', () => {
    const [e, n] = toUtm(campinas, 23, 'S');
    expect(e).toBeGreaterThan(280_000);
    expect(e).toBeLessThan(300_000);
    expect(n).toBeGreaterThan(7_460_000);
    expect(n).toBeLessThan(7_470_000);
    const [lng, lat] = fromUtm(e, n, 23, 'S');
    expect(lng).toBeCloseTo(campinas[0], 9);
    expect(lat).toBeCloseTo(campinas[1], 9);
  });

  it('números com vírgula decimal e separador de milhar', () => {
    expect(parseNumber('7465123,45')).toBe(7465123.45);
    expect(parseNumber('7.465.123,45')).toBe(7465123.45);
    expect(parseNumber('7,465,123.45')).toBe(7465123.45);
    expect(parseNumber('-22.9056')).toBe(-22.9056);
  });

  it('graus, minutos e segundos', () => {
    expect(parseAngle(`22°54'20,16"S`)).toBeCloseTo(-22.9056, 6);
    expect(parseAngle('47 03 38.88 W')).toBeCloseTo(-47.0608, 6);
    expect(toDms(-22.9056, 'lat')).toBe(`22°54'20,160"S`);
    const [lat, lng] = formatPair(campinas, { kind: 'dms' });
    expect(parsePair(lat, lng, { kind: 'dms' })![1]).toBeCloseTo(campinas[1], 6);
  });

  it('lista colada do Excel com cabeçalho e identificador do vértice', () => {
    const utm = { kind: 'utm' as const, zone: 23, hemisphere: 'S' as const };
    const text = 'Vértice\tE\tN\nV1\t290512,35\t7465210,80\nV2\t290610,12\t7465198,44\n\nV3\t290598,90\t7465101,05\nlixo';
    const { points, errors } = parseCoordinateList(text, utm);
    expect(points).toHaveLength(3);
    expect(errors).toEqual([6]);
    const back = toUtm(points[0], 23, 'S');
    expect(back[0]).toBeCloseTo(290512.35, 3);
  });

  it('rejeita UTM fora do intervalo e latitude inválida', () => {
    expect(parsePair('12', '34', { kind: 'utm', zone: 23, hemisphere: 'S' })).toBeNull();
    expect(parsePair('-95', '-47', { kind: 'geo' })).toBeNull();
  });
});

describe('medidas geodésicas', () => {
  it('área e perímetro coincidem com o PostGIS (geography)', () => {
    const d = 0.001;
    const ring: LngLat[] = [campinas, [campinas[0] + d, campinas[1]], [campinas[0] + d, campinas[1] - d], [campinas[0], campinas[1] - d]];
    const { areaM2, perimeterM } = polygonMetrics(ring);
    // Valores calculados pela API (ST_Area/ST_Perimeter em geography) para o mesmo polígono
    expect(areaM2).toBeCloseTo(11361.46, 0);
    expect(perimeterM).toBeCloseTo(426.67, 0);
  });

  it('comprimento de linha', () => {
    expect(lineLength([campinas, [campinas[0], campinas[1] - 0.001]])).toBeCloseTo(110.6, 0);
  });
});
