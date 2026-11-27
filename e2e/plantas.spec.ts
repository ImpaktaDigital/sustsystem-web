import { expect, test, type Page } from '@playwright/test';

/** Parte 4 — elementos pontuais e plantas em PDF, com os dados do seed da API (senha Sust@2026). */
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

async function openEnterprise(page: Page) {
  await page.getByRole('link', { name: 'Empreendimentos' }).first().click();
  await page.getByPlaceholder(/Buscar por nome/).fill('Guarulhos');
  await page.getByText('Unidade Fabril Guarulhos').first().click();
  await expect(page.getByText('Áreas e localização')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('engenheira posiciona elemento, gera prévia e emite planta de delimitação', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'engenheira@sustsystem.dev');
  await openEnterprise(page);

  // ── Elemento pontual no editor ──
  await page.getByRole('link', { name: 'Abrir editor geográfico' }).click();
  await expect(page.locator('[data-testid=editor-map] canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.el-marker').first()).toBeVisible(); // elementos do seed
  await page.getByRole('button', { name: 'Elemento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Extintor PQS' }).click();
  const box = (await page.locator('[data-testid=editor-map] canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
  await expect(page.getByText('Novo elemento')).toBeVisible();
  await expect(page.getByLabel('Rótulo')).toHaveValue(/^PQS-\d{2}$/);
  await page.getByLabel('Rótulo').fill(`E-${unique}`);
  await page.getByLabel('Especificação').fill('PQS ABC 12 kg — 3-A:40-BC');
  await shot(page, '30-editor-elemento');
  await page.getByRole('button', { name: 'Salvar elemento' }).click();
  await expect(page.getByText(`Elemento E-${unique} salvo`)).toBeVisible();
  await page.getByRole('tab', { name: /Camadas/ }).click();
  await expect(page.getByRole('button', { name: `Elemento E-${unique}` })).toBeVisible();

  // ── Planta de delimitação ──
  await page.getByRole('link', { name: 'Voltar ao empreendimento' }).click();
  await page.getByRole('tab', { name: 'Plantas' }).click();
  await page.getByRole('button', { name: 'Nova planta' }).click();
  await page.getByRole('menuitem', { name: 'Planta de delimitação' }).click();
  await expect(page.getByRole('heading', { name: 'Nova planta de delimitação' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Responsável técnico' })).toHaveValue('Elisa Engenheira');
  await page.getByRole('button', { name: 'Gerar prévia' }).click();
  await expect(page.getByTestId('plant-preview')).toBeVisible({ timeout: 120_000 });
  await shot(page, '31-planta-previa');

  const issueButton = page.getByRole('button', { name: /^Emitir R\d{2}$/ });
  const revision = (await issueButton.textContent())!.replace('Emitir ', '');
  await issueButton.click();
  const [pdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('dialog').getByRole('button', { name: 'Emitir e baixar PDF' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe(`unidade-fabril-guarulhos-planta-delimitacao-${revision}.pdf`);
  if (SHOTS) await pdf.saveAs(`${SHOTS}/planta-emitida.pdf`);
  await expect(page.getByText(new RegExp(`Planta de delimitação ${revision} emitida`))).toBeVisible();
  await expect(page.getByRole('cell', { name: revision }).first()).toBeVisible();
  await shot(page, '32-plantas-lista');

  // Novo download da revisão emitida (gerado a partir do registro)
  const [again] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('row', { name: new RegExp(revision) }).first().getByRole('button', { name: 'Baixar PDF' }).click(),
  ]);
  expect(again.suggestedFilename()).toBe(`unidade-fabril-guarulhos-planta-delimitacao-${revision}.pdf`);
});

test('gestor emite planta de localização e configura símbolo', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'gestor@sustsystem.dev');
  await openEnterprise(page);
  await page.getByRole('tab', { name: 'Plantas' }).click();
  await page.getByRole('button', { name: 'Nova planta' }).click();
  await page.getByRole('menuitem', { name: 'Planta de localização' }).click();
  await expect(page.getByRole('heading', { name: 'Nova planta de localização' })).toBeVisible();
  await page.getByRole('button', { name: /^Emitir R\d{2}$/ }).click();
  const [pdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('dialog').getByRole('button', { name: 'Emitir e baixar PDF' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/planta-localizacao-R\d{2}\.pdf$/);
  if (SHOTS) await pdf.saveAs(`${SHOTS}/planta-localizacao-emitida.pdf`);

  await page.getByRole('link', { name: 'Tipos de área e símbolos' }).click();
  await page.getByRole('tab', { name: 'Elementos pontuais' }).click();
  await page.getByRole('button', { name: 'Novo tipo de elemento' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome').fill(`Caixa separadora ${unique}`);
  await modal.getByLabel('Sigla').fill('csao');
  await expect(modal.getByLabel('Sigla')).toHaveValue('CSAO');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Tipo de elemento criado')).toBeVisible();
  await expect(page.getByText(`Caixa separadora ${unique}`)).toBeVisible();
  await shot(page, '33-tipos-elemento');
});
