import { expect, test, type Page } from '@playwright/test';

/** Parte 3 — editor geográfico, com os usuários e as áreas de exemplo do seed da API (senha Sust@2026). */
const PASSWORD = 'Sust@2026';
const SHOTS = process.env.E2E_SCREENSHOTS;
const unique = Date.now().toString().slice(-6);

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
}

async function openEditor(page: Page) {
  await page.getByRole('link', { name: 'Empreendimentos' }).first().click();
  await page.getByPlaceholder(/Buscar por nome/).fill('Guarulhos');
  await page.getByText('Unidade Fabril Guarulhos').first().click();
  await expect(page.getByText('Áreas e localização')).toBeVisible();
  await expect(page.getByText('Galpão de produção')).toBeVisible();
  await shot(page, '20-empreendimento-areas');
  await page.getByRole('link', { name: 'Abrir editor geográfico' }).click();
  await expect(page.getByText(/Editor geográfico — Unidade Fabril Guarulhos/)).toBeVisible();
  await expect(page.locator('[data-testid=editor-map] canvas')).toBeVisible();
  await page.waitForTimeout(1500); // carregamento do mapa e enquadramento
}

test.describe.configure({ mode: 'serial' });

test('engenheira desenha, edita, valida, cola coordenadas, importa e exporta áreas', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'engenheira@sustsystem.dev');
  await openEditor(page);
  await shot(page, '21-editor');

  // ── Desenho de nova área ──
  const canvas = page.locator('[data-testid=editor-map] canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.getByRole('button', { name: 'Nova área' }).click();
  for (const [dx, dy] of [[-160, -110], [140, -120], [160, 100], [-150, 120]]) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.vx')).toHaveCount(4);
  await page.locator('.vx', { hasText: /^1$/ }).click(); // fecha no vértice 1
  await expect(page.locator('.vx-mid')).toHaveCount(4); // modo de edição com pontos médios
  await page.getByRole('textbox', { name: 'Tipo de área' }).click();
  await page.getByRole('option', { name: /APP/ }).click();
  await page.getByLabel('Nome da área').fill(`APP desenhada ${unique}`);
  await expect(page.getByText('Perímetro', { exact: true })).toBeVisible();
  await shot(page, '22-editor-desenho');
  await page.getByRole('button', { name: 'Salvar área (V1)' }).click();
  await expect(page.getByText(new RegExp(`APP desenhada ${unique}" salva \\(V1\\)`))).toBeVisible();

  // ── Edição de vértice com desfazer/refazer e nova versão ──
  await page.getByRole('tab', { name: /Camadas/ }).click();
  await page.getByRole('button', { name: 'Área Galpão de produção' }).click();
  await page.getByRole('button', { name: 'Editar vértices' }).first().click();
  const save = page.getByRole('button', { name: /Salvar como V\d+/ });
  await expect(save).toBeDisabled();
  const vertex = (await page.locator('.vx').nth(1).boundingBox())!;
  await page.mouse.move(vertex.x + vertex.width / 2, vertex.y + vertex.height / 2);
  await page.mouse.down();
  await page.mouse.move(vertex.x + 60, vertex.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Refazer' }).click();
  await expect(save).toBeEnabled();
  await page.getByLabel(/Observações da versão V/).fill('Ajuste do canto nordeste conforme vistoria');
  await shot(page, '23-editor-edicao');
  await save.click();
  await expect(page.getByText(/Versão V\d+ salva — as anteriores foram preservadas/)).toBeVisible();

  // ── Histórico e validação técnica ──
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByText('Ajuste do canto nordeste conforme vistoria').first()).toBeVisible();
  await page.getByRole('button', { name: /^Validar V\d+$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Validar' }).click();
  await expect(page.getByText(/Versão V\d+ validada/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Comparar no mapa' }).first().click();
  await shot(page, '24-editor-historico');

  // ── Nova área por coordenadas coladas ──
  await page.getByRole('button', { name: 'Colar coordenadas' }).first().click();
  const paste = page.getByRole('dialog');
  await paste.getByRole('textbox', { name: 'Sistema de coordenadas' }).click();
  await page.getByRole('option', { name: 'Geográficas — graus decimais' }).click();
  await paste.getByRole('textbox', { name: /Uma linha por vértice/ }).fill('-23,4560;-46,5345\n-23,4560;-46,5335\n-23,4566;-46,5335\n-23,4566;-46,5345');
  await expect(paste.getByText(/4 vértice\(s\) reconhecido\(s\)/)).toBeVisible();
  await paste.getByRole('button', { name: 'Usar 4 vértices' }).click();
  await page.getByLabel('Nome da área').fill(`Área por coordenadas ${unique}`);
  await page.getByRole('button', { name: 'Salvar área (V1)' }).click();
  await expect(page.getByText(new RegExp(`Área por coordenadas ${unique}" salva`))).toBeVisible();

  // ── Importação de GeoJSON ──
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const geojson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: `Reserva legal importada ${unique}` },
      geometry: { type: 'Polygon', coordinates: [[[-46.5350, -23.4530], [-46.5340, -23.4530], [-46.5340, -23.4535], [-46.5350, -23.4535], [-46.5350, -23.4530]]] },
    }],
  };
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'areas.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geojson)) });
  await expect(page.getByRole('dialog').getByText(/1 polígono\(s\) encontrado\(s\) no GeoJSON/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Tipo de área' })).toHaveValue('Reserva Legal');
  await page.getByRole('dialog').getByRole('button', { name: /Importar 1 área/ }).click();
  await expect(page.getByText('1 área(s) importada(s)')).toBeVisible();
  await expect(page.getByRole('button', { name: `Área Reserva legal importada ${unique}` })).toBeVisible();

  // ── Importação de KML ──
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>APP do córrego ${unique}</name>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>-46.5330,-23.4555,0 -46.5322,-23.4555,0 -46.5322,-23.4560,0 -46.5330,-23.4560,0 -46.5330,-23.4555,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Document></kml>`;
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'app.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from(kml) });
  await expect(page.getByRole('dialog').getByText(/1 polígono\(s\) encontrado\(s\) no KML/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Tipo de área' })).toHaveValue('Área de Preservação Permanente (APP)');
  await page.getByRole('dialog').getByRole('button', { name: /Importar 1 área/ }).click();
  await expect(page.getByText('1 área(s) importada(s)').first()).toBeVisible();

  // ── GeoJSON em UTM com a projeção declarada (reprojeção para graus) ──
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const utmFile = {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::31983' } },
    features: [{ type: 'Feature', properties: { nome: `Galpão levantado ${unique}` }, geometry: { type: 'Polygon', coordinates: [[[343500, 7405400], [343560, 7405400], [343560, 7405460], [343500, 7405460], [343500, 7405400]]] } }],
  };
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'levantamento.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(utmFile)) });
  await expect(page.getByRole('dialog').getByText(/a zona foi lida do arquivo/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('cell', { name: /^0,360\d ha$/ })).toBeVisible(); // 60 m × 60 m no plano UTM (a área geodésica difere pelo fator de escala)
  await page.getByRole('dialog').getByRole('button', { name: /Importar 1 área/ }).click();
  await expect(page.getByRole('button', { name: `Área Galpão levantado ${unique}` })).toBeVisible();

  // ── Exportação ──
  await page.getByRole('button', { name: 'Exportar' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'KML (Google Earth)' }).first().click()]);
  expect(file.suggestedFilename()).toMatch(/unidade-fabril-guarulhos-areas-atuais\.kml/);
  await page.waitForTimeout(800);
  await shot(page, '25-editor-camadas');
});

test('técnico de campo edita, mas não valida; gestor configura tipos de área', async ({ page }) => {
  await login(page, 'tecnico@sustsystem.dev');
  await page.goto('/');
  await openEditor(page);
  await page.getByRole('button', { name: 'Área Galpão de produção' }).click();
  await expect(page.getByRole('button', { name: 'Editar vértices' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Validar V\d+$/ })).toHaveCount(0);

  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await login(page, 'gestor@sustsystem.dev');
  await page.getByRole('link', { name: 'Tipos de área' }).click();
  await page.getByRole('button', { name: 'Novo tipo' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill(`Área de lavagem ${unique}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Tipo de área criado')).toBeVisible();
  await expect(page.getByText(`Área de lavagem ${unique}`)).toBeVisible();
  await shot(page, '26-tipos-de-area');
});
