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

## Telas (Partes 2 e 3)

| Rota | Tela |
|---|---|
| `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha` | Acesso. A última é o destino dos links de convite e de redefinição enviados por e-mail |
| `/` | Painel com indicadores e mapa dos empreendimentos |
| `/clientes` | Lista, busca, cadastro PF/PJ, contatos, empreendimentos e histórico |
| `/empreendimentos` | Lista com filtros, cadastro com localização no mapa, atividades, dados fundiários, equipe e histórico |
| `/empreendimentos/:id/editor` | **Editor geográfico** (tela cheia): desenho e edição de polígonos, desfazer/refazer, medição, camadas por tipo, vértices em UTM/geográficas, colar coordenadas, importação (GeoJSON, KML, KMZ, Shapefile .zip), exportação (GeoJSON, KML), histórico de versões e validação técnica |
| `/configuracoes/tipos-de-area` | Tipos de área da organização (nome, cor, ordem) |
| `/usuarios` | Equipe: convites, perfis, desativação e exclusão (só sem registros) |
| `/plataforma/organizacoes` | Operador da plataforma: organizações |
| `/perfil` | Dados, troca de senha e de organização |

O menu e as telas seguem as permissões do usuário. A API também valida todas elas.

## Mapas

Área e perímetro são calculados no navegador com GeographicLib (elipsoide WGS 84), o mesmo cálculo do PostGIS na API; os valores exibidos durante a edição coincidem com os gravados. Conversões UTM SIRGAS 2000 via proj4 ([src/lib/crs.ts](src/lib/crs.ts)).


Os provedores de mapa base ficam configurados em [src/map/basemaps.ts](src/map/basemaps.ts). No MVP: OpenStreetMap (ruas) e Esri World Imagery (satélite), sem chave de API.
**Antes do uso comercial, revisar os termos de uso de ambos.** O provedor é abstraído, então dá para trocar sem mexer nas telas.

## Deploy (Vercel)

1. Na Vercel: *Add New → Project*, importar este repositório. O framework (Vite) é detectado pelo [vercel.json](vercel.json).
2. Em *Environment Variables*, configurar `VITE_API_URL=https://sustsystem-api.onrender.com`.
3. No Render (API), adicionar a URL da Vercel em `CORS_ORIGINS` e defini-la em `WEB_URL`, que é usada nos links dos e-mails.

O código em `src/lib/shared` (CPF/CNPJ, perfis/permissões, zona UTM) é uma cópia do mesmo diretório da API e deve ser mantido igual.
