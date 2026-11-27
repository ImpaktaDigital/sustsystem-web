import { expect, test, type Page } from '@playwright/test';

/** Fluxos principais da Parte 2, com os usuários do seed da API (senha Sust@2026). */
const PASSWORD = 'Sust@2026';
const SHOTS = process.env.E2E_SCREENSHOTS; // pasta opcional para salvar capturas de tela
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

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
}

async function pickOption(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByRole('textbox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

test.describe.configure({ mode: 'serial' });

test('login inválido mostra mensagem', async ({ page }) => {
  await page.goto('/login');
  await shot(page, '01-login');
  await page.getByLabel('E-mail').fill('gestor@sustsystem.dev');
  await page.getByLabel('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('E-mail ou senha inválidos')).toBeVisible();
});

test('gestor cadastra cliente, contato e empreendimento', async ({ page }) => {
  await login(page, 'gestor@sustsystem.dev');
  await page.waitForTimeout(1500); // tiles do mapa
  await shot(page, '02-painel');

  // Cliente
  await page.getByRole('link', { name: 'Clientes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await shot(page, '03-clientes');
  await page.getByRole('link', { name: 'Novo cliente' }).click();

  await page.getByLabel('CNPJ').fill('11.111.111/1111-11');
  await page.getByLabel('Razão social').fill(`Cerâmica Teste ${unique} Ltda`);
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByText('CPF/CNPJ inválido')).toBeVisible();

  const cnpj = makeCnpj();
  await page.getByLabel('CNPJ').fill(cnpj);
  await page.getByLabel('Nome fantasia').fill(`Cerâmica ${unique}`);
  // Atividades: CNAE com descrição do IBGE e marcação da principal
  await page.getByRole('button', { name: 'Adicionar atividade' }).click();
  await page.getByRole('textbox', { name: 'CNAE' }).nth(0).fill('2342702');
  await expect(page.getByRole('textbox', { name: 'CNAE' }).nth(0)).toHaveValue('2342-7/02');
  await expect(page.getByRole('textbox', { name: 'Descrição (IBGE)' }).nth(0)).toHaveValue(/cerâmica/i);
  await page.getByRole('button', { name: 'Adicionar atividade' }).click();
  await page.getByRole('textbox', { name: 'CNAE' }).nth(1).fill('3811400');
  await expect(page.getByRole('textbox', { name: 'Descrição (IBGE)' }).nth(1)).toHaveValue(/coleta de resíduos/i);
  await expect(page.getByRole('checkbox', { name: 'Principal' }).nth(0)).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Principal' }).nth(1)).not.toBeChecked();
  await page.getByLabel('Telefone').fill('19987654321');
  await page.getByLabel('Município').fill('Campinas');
  await pickOption(page, 'UF', 'SP');
  await shot(page, '04-cliente-form');
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();

  await expect(page.getByText('Cliente cadastrado')).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(`Cerâmica Teste ${unique}`) })).toBeVisible();
  await expect(page.getByText(/Coleta de resíduos não perigosos/i)).toBeVisible();

  // Contato
  await page.getByRole('tab', { name: /Contatos/ }).click();
  await page.getByRole('button', { name: 'Adicionar' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome').fill('Joana Responsável');
  await modal.getByLabel('Cargo / função').fill('Gerente Ambiental');
  await modal.getByLabel('E-mail').fill('joana@exemplo.com');
  await modal.getByLabel('Contato principal').check();
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('cell', { name: 'Joana Responsável Principal' })).toBeVisible();
  await shot(page, '05-cliente-contatos');

  // Empreendimento a partir do cliente
  await page.getByRole('tab', { name: /Empreendimentos/ }).click();
  await page.getByRole('link', { name: 'Novo empreendimento' }).click();
  await expect(page.getByRole('textbox', { name: 'Cliente' })).toHaveValue(new RegExp(`Cerâmica ${unique}`));
  await page.getByLabel('Nome do empreendimento').fill(`Planta Campinas ${unique}`);
  await pickOption(page, 'Tipo', 'Fábrica / planta industrial');
  // Endereço posiciona o ponto no mapa automaticamente
  await page.getByLabel('Logradouro').fill('Avenida Francisco Glicério');
  await page.getByLabel('Número').fill('1000');
  await page.getByLabel('Município').fill('Campinas');
  await pickOption(page, 'UF', 'SP');
  await expect(page.getByText(/Ponto posicionado pelo endereço/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Latitude')).toHaveValue(/^-22\.[89]/);
  await expect(page.getByText(/UTM zone 23S \(EPSG:31983\)/)).toBeVisible();
  // Ajuste manual: coordenadas digitadas e clique no mapa
  await page.getByLabel('Latitude').fill('-22.9056');
  await page.getByLabel('Longitude').fill('-47.0608');
  await page.locator('.map-container canvas').first().click({ position: { x: 400, y: 150 } });
  await expect(page.getByText(/Ponto ajustado manualmente/)).toBeVisible();
  // Atividades copiadas do cliente, com descrição do IBGE
  await page.getByRole('button', { name: 'Copiar CNAEs do cliente' }).click();
  await expect(page.getByRole('textbox', { name: 'Descrição da atividade' })).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Descrição da atividade' }).nth(0)).toHaveValue(/cerâmica/i);
  await page.getByRole('textbox', { name: 'Descrição da atividade' }).nth(0).fill('Fabricação de artefatos cerâmicos');
  await page.waitForTimeout(1500);
  await shot(page, '06-empreendimento-form');
  await page.getByRole('button', { name: 'Cadastrar empreendimento' }).click();

  await expect(page.getByText('Empreendimento cadastrado')).toBeVisible();
  await expect(page.getByText('Fabricação de artefatos cerâmicos')).toBeVisible();
  await expect(page.getByText(/EPSG:3198/)).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '07-empreendimento-detalhe');
});

test('técnico de campo só vê empreendimentos atribuídos', async ({ page }) => {
  await login(page, 'tecnico@sustsystem.dev');
  await expect(page.getByRole('link', { name: 'Clientes' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Empreendimentos' }).first().click();
  await expect(page.getByText('Empreendimentos atribuídos a você')).toBeVisible();
  await expect(page.getByText('Unidade Fabril Guarulhos')).toBeVisible();
  await expect(page.getByText(`Planta Campinas ${unique}`)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Novo empreendimento' })).toHaveCount(0);
  await shot(page, '08-tecnico-empreendimentos');
});

test('administrador convida membro e vê histórico', async ({ page }) => {
  await login(page, 'admin@sustsystem.dev');
  await page.getByRole('link', { name: 'Equipe e usuários' }).click();
  await page.getByRole('button', { name: 'Adicionar membro' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome').fill(`Convidado ${unique}`);
  await modal.getByLabel('E-mail').fill(`convidado${unique}@exemplo.com`);
  await modal.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText(`Convite enviado para convidado${unique}@exemplo.com`)).toBeVisible();
  await expect(page.getByText(`Convidado ${unique}`)).toBeVisible();
  await shot(page, '09-usuarios');

  // Membro com registros (gestor) só pode ser inativado; o recém-convidado pode ser excluído
  await page.getByRole('button', { name: /Ações para Gustavo/ }).click();
  await expect(page.getByText(/registro\(s\): apenas inativar/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `Ações para Convidado ${unique}` }).click();
  await page.getByRole('menu', { name: `Ações para Convidado ${unique}` }).getByRole('menuitem', { name: 'Excluir usuário', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText(`Convidado ${unique} foi excluído(a) da organização`)).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(`convidado${unique}@`) })).toHaveCount(0);

  await page.getByRole('link', { name: 'Clientes' }).first().click();
  await page.getByRole('textbox', { name: 'Buscar clientes' }).fill(`Teste ${unique}`);
  await page.getByText(`Cerâmica Teste ${unique} Ltda`).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByText('Cadastro criado')).toBeVisible();
  await expect(page.getByText('Contato adicionado')).toBeVisible();
  await shot(page, '10-cliente-historico');
});

test('operador da plataforma gerencia organizações', async ({ page }) => {
  await login(page, 'plataforma@sustsystem.dev');
  await page.getByRole('link', { name: 'Organizações' }).click();
  await expect(page.getByRole('cell', { name: /Escritório Demo Engenharia Ambiental/ }).first()).toBeVisible();
  await shot(page, '11-plataforma');
});

test('telas públicas: cadastro e esqueci a senha', async ({ page }) => {
  await page.goto('/cadastro');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Informe o nome da organização')).toBeVisible();
  await shot(page, '12-cadastro');

  await page.goto('/esqueci-senha');
  await page.getByLabel('E-mail').fill('gestor@sustsystem.dev');
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText(/Se houver uma conta com este e-mail/)).toBeVisible();

  await page.goto('/redefinir-senha?token=invalido.abc');
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha123');
  await page.getByLabel('Confirme a nova senha').fill('NovaSenha123');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByText(/Link inválido ou expirado/)).toBeVisible();
});
