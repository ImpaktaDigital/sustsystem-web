import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/** Parte 5A — triagem na Web de um levantamento enviado pelo app (simulado pela API). */
const API = process.env.E2E_API_URL ?? 'http://localhost:3333/api/v1';
const PASSWORD = 'Sust@2026';
const SHOTS = process.env.E2E_SCREENSHOTS;
const unique = Date.now().toString().slice(-6);

function makeCnpj() {
  const base = Array.from({ length: 12 }, (_, i) => (i < 8 ? Math.floor(Math.random() * 10) : [0, 0, 0, 1][i - 8]));
  const digit = (b: number[]) => {
    const w = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = b.reduce((s, n, i) => s + n * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  base.push(digit(base));
  base.push(digit(base));
  return base.join('');
}

/** Envia um levantamento como o app faria: pré-cadastro, uma área por GPS, um poço e uma foto. */
async function sendSurvey(request: APIRequestContext) {
  const login = await (await request.post(`${API}/auth/login`, { data: { email: 'tecnico@sustsystem.dev', password: PASSWORD } })).json();
  const headers = { authorization: `Bearer ${login.accessToken}` };
  const areaTypes = await (await request.get(`${API}/area-types`, { headers })).json();
  const elementTypes = await (await request.get(`${API}/element-types`, { headers })).json();
  const id = randomUUID();
  const well = randomUUID();
  const photo = randomUUID();
  const ring = [[-46.6455, -23.5505], [-46.6440, -23.5503], [-46.6438, -23.5516], [-46.6454, -23.5518], [-46.6455, -23.5505]];
  const res = await request.post(`${API}/surveys`, {
    headers,
    data: {
      id, title: `Sítio Primeiro Contato ${unique}`, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      deviceInfo: { model: 'Pixel 8', os: 'Android 15', app: '0.1.0' },
      preRegistration: {
        clientType: 'PJ', clientName: `Agro Primeiro Contato ${unique} Ltda`, contactName: 'Maria', contactPhone: '(11) 98888-7777',
        enterpriseName: `Sítio Primeiro Contato ${unique}`, enterpriseType: 'RURAL_PROPERTY', city: 'São Paulo', state: 'SP', projectHint: 'CAR e outorga do poço',
      },
      features: [
        { id: randomUUID(), kind: 'AREA', name: 'Perímetro do sítio', suggestedTypeId: areaTypes[0].id, method: 'GPS_WALK', geometry: { type: 'Polygon', coordinates: [ring] }, vertexAccuracies: [3.1, 2.7, 3.9, 4.4] },
        { id: well, kind: 'ELEMENT', name: 'Poço 01', suggestedTypeId: elementTypes.find((t: { code: string }) => t.code === 'P').id, method: 'GPS_VERTICES', geometry: { type: 'Point', coordinates: [-46.6447, -23.5510] }, vertexAccuracies: [2.9], specification: 'Poço tubular 80 m' },
      ],
      photos: [{ id: photo, featureId: well, contentType: 'image/png', latitude: -23.551, longitude: -46.6447, accuracyM: 3, heading: 45, takenAt: new Date().toISOString(), caption: 'Poço 01' }],
    },
  });
  const body = await res.json();
  // Foto 1×1 PNG enviada direto ao storage pela URL assinada
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await request.put(body.uploads[0].url, { headers: body.uploads[0].headers, data: png });
  await request.post(`${API}/surveys/${id}/photos/${photo}/uploaded`, { headers });
  return id;
}

test('gestor faz a triagem: cadastra cliente/empreendimento do pré-cadastro e aprova', async ({ page, request }) => {
  test.setTimeout(120_000);
  const surveyId = await sendSurvey(request);

  await page.goto('/login');
  await page.getByLabel('E-mail').fill('gestor@sustsystem.dev');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();

  await page.getByRole('link', { name: /Levantamentos/ }).click();
  await page.getByText(`Sítio Primeiro Contato ${unique}`).first().click();
  await expect(page).toHaveURL(new RegExp(`/levantamentos/${surveyId}`));
  await expect(page.getByText('CAR e outorga do poço')).toBeVisible();
  await expect(page.getByText('Percurso GPS')).toBeVisible();
  await expect(page.getByText(/±3,?\.?\d? m \(pior ±4\.4 m\)|pior ±4.4 m/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Poço 01' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/40-levantamento-triagem.png`, fullPage: true });

  // Cadastro a partir do pré-cadastro (CNPJ obtido com o cliente)
  await page.getByRole('button', { name: 'Cadastrar a partir do pré-cadastro' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Razão social')).toHaveValue(`Agro Primeiro Contato ${unique} Ltda`);
  await modal.getByLabel('CNPJ').fill(makeCnpj());
  await modal.getByRole('button', { name: 'Cadastrar e vincular' }).click();
  await expect(page.getByText('Levantamento vinculado ao empreendimento')).toBeVisible();

  await page.getByRole('button', { name: 'Aprovar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText('Levantamento aprovado: áreas e elementos criados no empreendimento')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir no editor geográfico' })).toBeVisible();

  await page.getByRole('link', { name: 'Abrir no editor geográfico' }).click();
  await expect(page.getByRole('button', { name: 'Área Perímetro do sítio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elemento Poço 01' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/41-levantamento-no-editor.png` });
});

test('gestor exclui um levantamento em triagem', async ({ page, request }) => {
  test.setTimeout(120_000);
  await sendSurvey(request);
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('gestor@sustsystem.dev');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  await page.getByRole('link', { name: /Levantamentos/ }).click();
  await page.getByText(`Sítio Primeiro Contato ${unique}`).first().click();
  await page.getByRole('button', { name: 'Excluir levantamento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText('Levantamento excluído')).toBeVisible();
  await expect(page).toHaveURL(/\/levantamentos$/);
});
