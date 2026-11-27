# SustSystem Web

Aplicação Web da plataforma SustSystem, feita com React, Vite, TypeScript, Mantine, TanStack Query, React Hook Form + zod e MapLibre.

Consome a [sustsystem-api](https://github.com/ImpaktaDigital/sustsystem-api).

## Rodando localmente

```bash
npm install
cp .env.example .env     # VITE_API_URL: http://localhost:3333 (API local) ou https://sustsystem-api.onrender.com
npm run dev              # http://localhost:5173
```

Para usar a API publicada a partir do `localhost`, o Render precisa ter `http://localhost:5173` em `CORS_ORIGINS`.

| Comando | Descrição |
|---|---|
| `npm run typecheck` | Verificação de tipos |
| `npm test` | Testes unitários (vitest) |
| `npm run build` | Build de produção (`dist/`) |
| `npm run e2e` | Testes de ponta a ponta (Playwright). Exigem API local com seed e `npm run dev` rodando. Na primeira vez: `npx playwright install chromium` |

## Telas (Partes 2 a 4)

| Rota | Tela |
|---|---|
| `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha` | Acesso. A última é o destino dos links de convite e de redefinição enviados por e-mail |
| `/` | Painel com indicadores e mapa dos empreendimentos |
| `/clientes` | Lista, busca, cadastro PF/PJ, contatos, empreendimentos e histórico |
| `/empreendimentos` | Lista com filtros, cadastro com localização no mapa, atividades, dados fundiários, equipe e histórico |
| `/empreendimentos/:id/editor` | **Editor geográfico** (tela cheia): desenho e edição de polígonos, desfazer/refazer, medição, camadas por tipo, vértices em UTM/geográficas, colar coordenadas, importação (GeoJSON, KML, KMZ, Shapefile .zip), exportação (GeoJSON, KML), histórico de versões e validação técnica |
| `/empreendimentos/:id?aba=plantas` | Revisões de planta emitidas (novo download idêntico do PDF) |
| `/empreendimentos/:id/plantas/nova` | **Gerador de planta** de localização ou delimitação: áreas (validadas ou atuais), quadro de vértices, elementos, folha/escala automáticas, carimbo (responsável técnico, data, revisão), prévia e emissão |
| `/configuracoes/tipos-de-area` | Tipos de área (nome, cor) e tipos de elemento pontual (símbolo: forma, sigla e cor) |
| `/usuarios` | Equipe: convites, perfis, desativação e exclusão (só sem registros) |
| `/plataforma/organizacoes` | Operador da plataforma: organizações |
| `/perfil` | Dados, troca de senha e de organização |

O menu e as telas seguem as permissões do usuário. A API também valida todas elas.

## Plantas em PDF

Geradas no navegador ([src/plants/](src/plants/)) com pdf-lib: mapa de fundo renderizado fora da tela na resolução de impressão (150 dpi; 120 dpi em A1/A0) e todo o resto vetorial (áreas, vértices, símbolos, grade UTM, norte, barra de escala, legenda, quadros e carimbo). Folhas ABNT série A em paisagem com margens da NBR 10068; quadros de vértices que não cabem vão para folhas adicionais. A API guarda cada revisão com um retrato completo (versões imutáveis das áreas), por isso o PDF pode ser gerado de novo de forma idêntica — exceto pela imagem de fundo, que o provedor pode atualizar.

## Mapas

Área e perímetro são calculados no navegador com GeographicLib (elipsoide WGS 84), o mesmo cálculo do PostGIS na API; os valores exibidos durante a edição coincidem com os gravados. Conversões UTM SIRGAS 2000 via proj4 ([src/lib/crs.ts](src/lib/crs.ts)).


Os provedores de mapa base ficam configurados em [src/map/basemaps.ts](src/map/basemaps.ts). No MVP: OpenStreetMap (ruas) e Esri World Imagery (satélite), sem chave de API.
**Antes do uso comercial, revisar os termos de uso de ambos.** O provedor é abstraído, então dá para trocar sem mexer nas telas.

## Deploy (Vercel)

1. Na Vercel: *Add New → Project*, importar este repositório. O framework (Vite) é detectado pelo [vercel.json](vercel.json).
2. Em *Environment Variables*, configurar `VITE_API_URL=https://sustsystem-api.onrender.com`.
3. No Render (API), adicionar a URL da Vercel em `CORS_ORIGINS` e defini-la em `WEB_URL`, que é usada nos links dos e-mails.

O código em `src/lib/shared` (CPF/CNPJ, perfis/permissões, zona UTM) é uma cópia do mesmo diretório da API e deve ser mantido igual.
