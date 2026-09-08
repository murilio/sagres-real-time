# Contexto — sagres-real-time

Atualizado: 2026-09-08

## Estado atual

App Next.js único (`app/`) com Prisma embutido, decisão de pivot já commitada. Rota `/` mostra tela inicial do painel: cabeçalho + mapa Leaflet (`react-leaflet`) enquadrando a Paraíba via `bounds`, ocupando `100dvh`. Verificado por execução: `pnpm typecheck` limpo, `pnpm build` ok, teste visual no navegador (zoom/pan ok, Paraíba enquadrada).
`next.config.ts` tem `agentRules: false` — Next 16 gera `app/AGENTS.md`/`app/CLAUDE.md` automaticamente e colidia com o `CLAUDE.md` real da raiz; confirmado que não reaparecem.
Route Handler de ingestão não existe ainda — só orientação de desenho em `docs/desenho-ingestao.md`. Plataforma de deploy segue `A DEFINIR` por decisão do usuário.
Mudanças do mapa **não commitadas**: diff em `app/app/page.tsx`, `app/app/globals.css`, `app/next.config.ts`, `app/package.json`, `app/pnpm-lock.yaml`, `app/next-env.d.ts`, mais untracked `app/src/components/`.
Nenhum teste automatizado no repositório. Os sete agentes em `.claude/agents/` seguem implementados.

## Stack

Node 22.18.0, pnpm 10.34.5 (fixado, ver Becos), TypeScript 5.9.3, Next.js (App Router), Prisma + `@prisma/client` + `@prisma/adapter-pg` 7.10.0 (fixado, não `latest`), `pg` 8.23.0, Postgres 16.10 (Docker). NestJS, worker separado, Redis/BullMQ — removidos do plano pelo pivot desta sessão.

## Decisões

- [2026-09-07] Usar os dados abertos em S3, não a SAGRES Captura API — a API exige token da ASTEC só para empresas cadastradas.
- [2026-09-07] Ingerir os 4 arquivos consolidados, não os 892 por município — mesma cobertura, 4 downloads.
- [2026-09-07] MVP com 2024–2026; histórico 2003+ fica para a Fase 4 — volume estimado em 60–100M linhas.
- [2026-09-07] Chave de negócio sintética + `row_hash` por linha — nenhum dataset traz identificador estável.
- [2026-09-07] Tabela de versões de registro alterado — é o diferencial sobre o portal do TCE, que só mostra o snapshot atual.
- [2026-09-07] Agentes em `.claude/agents/` do projeto, não em `~/.claude/agents/` — versionamento e controle junto do código.
- [2026-09-07] Estado do projeto em `CONTEXT-DATA.md` na raiz, separado de `CLAUDE.md` — instrução e estado não se misturam.
- [2026-09-07] Mensagens de commit em inglês — repositório não tinha convenção estabelecida.
- [2026-09-08] `orchestrator` monta o catálogo de agentes lendo frontmatter de `.claude/agents/*.md` em tempo de execução, sem lista fixa — não existe ferramenta `ListAgents` para consultar.
- [2026-09-08] `orchestrator` limitado a profundidade 1 e nunca despacha ação irreversível/externa sem autorização explícita — aninhamento funciona mas fica contido.
- [2026-09-08] `municipios.codigo_tce` é PK natural `char(3)` com CHECK `^[0-9]{3}$`, não id sintético — zero à esquerda é significativo na URL da fonte e nos últimos 3 dígitos de `codigo_unidade_gestora`.
- [2026-09-08] Resolver município pelo código do caminho/UG, nunca pelo nome do CSV — código `190` traz `Mataraca` em vez de `São José do Bonfim` em `receitas` 2003–2025 na fonte.
- [2026-09-08] CSV semente de municípios versionado em `packages/db/prisma/seed/municipios-tce-pb.csv` — TCE-PB não publica tabela de referência própria.
- [2026-09-08] Prisma fixado em `7.10.0`, `prisma@latest` é `8.0.0-rc` — não atualizar.
- [2026-09-08] pnpm fixado em `10.34.5` — última versão da série com layout `bin/pnpm.cjs` compatível com corepack 0.33.0 nesta máquina.
- [2026-09-08] Fixar `name: sagres-real-time` no topo de `app/docker-compose.yml` — Compose deriva o nome do projeto do diretório e, com o monorepo em `app/`, passaria a criar rede/projeto `app` em vez de `sagres-real-time`. (contexto superado pelo pivot abaixo, decisão registrada por histórico)
- [2026-09-08] Pivot de monorepo (NestJS API + worker BullMQ/Redis + Next.js web) para app Next.js único com Prisma embutido — pedido explícito do usuário, projeto de estudo e público.
- [2026-09-08] Nova env `DATABASE_POOL_MAX` (default 10) para controlar o pool do `pg.Pool` explicitamente — `connection_limit` na URL não é lido pelo driver `pg` do adapter.
- [2026-09-08] Plataforma de deploy fica em aberto por decisão do usuário — registrado como `A DEFINIR` em vez de escolhida por default.
- [2026-09-08] `agentRules: false` em `app/next.config.ts` — Next 16 gera `app/AGENTS.md`/`app/CLAUDE.md` a cada dev/build, colidindo com o `CLAUDE.md` real da raiz do repositório.
- [2026-09-08] `mapa-paraiba-loader.tsx` separado de `mapa-paraiba.tsx` para isolar o `next/dynamic(..., { ssr: false })` — Server Component não aceita `ssr: false` direto no App Router do Next 16.

## Demandas

- [2026-09-08] Criar a tela inicial do painel, "mapa de leaflet com foco no estado da paraiba" → `mapa-paraiba.tsx` (`react-leaflet`, `bounds` da PB) + `mapa-paraiba-loader.tsx` (`next/dynamic` `ssr:false`), `page.tsx` e `globals.css` ajustados para o layout de tela cheia, `leaflet`/`react-leaflet`/`@types/leaflet` fixados em `package.json`; achado de tooling corrigido (`agentRules: false`); suporte ao usuário sobre `npm run dev` não rodando na raiz (não confirmado se resolveu); `documenter` despachado em paralelo para `docs/`, resultado ainda não visto por este registro; nada commitado → `app/src/components/mapa-paraiba.tsx`, `app/src/components/mapa-paraiba-loader.tsx`, `app/app/page.tsx`, `app/app/globals.css`, `app/next.config.ts`, `app/package.json`
- [2026-09-08] Pivot de monorepo NestJS+Next.js para app único Next.js, "usar apenas o nextjs, com a API no nextjs usando o prisma" → `app/` reestruturado sem `apps/`/`packages/`/workspace, bug de `connection_limit` no pool corrigido com `DATABASE_POOL_MAX`, `pnpm install/typecheck/migrate/seed/build` verificados por execução, 223 municípios intactos, ADR-0004 e `docs/desenho-ingestao.md` novos, ADR-0001/ADR-0003 marcadas superadas na parte de arquitetura, `docs/plano.md` e demais docs reescritos, `CLAUDE.md` atualizado → `app/package.json`, `app/src/db.ts`, `app/.env`, `app/.env.example`, `docs/adr/ADR-0004-nextjs-unico.md`, `docs/desenho-ingestao.md`, `docs/plano.md`, `docs/guia-ambiente-local.md`, `docs/referencia/dimensao-municipios.md`, `docs/referencia/layout-csv-sagres.md`, `docs/procedencia-municipios.md`, `docs/README.md`, `CLAUDE.md`
- [2026-09-08] Mover o monorepo pnpm para dentro de `app/` e deixar o ambiente funcionando de novo → `pnpm install` a partir de `app/` reparou a instalação quebrada pelo move, lockfile passou a listar `next`, projeto Compose fixado em `sagres-real-time`, container antigo recriado sob o novo nome sem perda do volume (223 municípios intactos), `.gitignore` e `CLAUDE.md` atualizados, docs revisados pelo `documenter` → `app/docker-compose.yml`, `CLAUDE.md`, `.gitignore`, `docs/guia-ambiente-local.md`, `docs/plano.md`, `docs/referencia/dimensao-municipios.md`, `docs/referencia/layout-csv-sagres.md`, `docs/procedencia-municipios.md`, `docs/README.md`, `docs/adr/ADR-0001-nextjs-nestjs-prisma.md`, `docs/adr/ADR-0002-dimensao-municipios.md`, `docs/adr/ADR-0003-prisma-7-driver-adapter.md`
- [2026-09-08] Criar primeira tabela do back — dimensão `municipios` da PB com `tcecode` → schema Prisma + migração + seed em `packages/db`, monorepo pnpm scaffolded, 6 docs novos/atualizados; 223 linhas verificadas no banco, idempotência do seed verificada por execução dupla; nada commitado → `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20260908122955_init_municipios/migration.sql`, `packages/db/prisma/seed/municipios-tce-pb.csv`, `packages/db/src/seed/municipios.ts`, `docs/referencia/dimensao-municipios.md`, `docs/procedencia-municipios.md`, `docs/adr/ADR-0002-dimensao-municipios.md`, `docs/adr/ADR-0003-prisma-7-driver-adapter.md`
- [2026-09-08] Criar sétimo subagente, orquestrador genérico e agnóstico de elenco → `orchestrator` (153 linhas), catálogo lido em tempo de execução do frontmatter de `.claude/agents/*.md`, profundidade máxima 1, modo padrão PLANO → `.claude/agents/orchestrator.md`, `CLAUDE.md`
- [2026-09-07] Criar sexto subagente, dono de `docs/` → `documenter` (163 linhas), organiza por propósito de leitura (explicação/guia/referência/operação), ADR imutável, sem evidência vira `A DEFINIR:`, prosa normal no corpo (exceção ao caveman, igual `committer`) → `.claude/agents/documenter.md`, `CLAUDE.md`
- [2026-09-07] Criar quinto subagente de desenho de frontend → `frontend-architect` (174 linhas), cinco eixos (performance de carga e runtime separadas, escalabilidade, manutenibilidade, corretude de estado assíncrono, acessibilidade) → `.claude/agents/frontend-architect.md`, `CLAUDE.md`
- [2026-09-07] Criar quarto subagente de desenho de backend → `backend-architect` (166 linhas), escopo dividido com `sonar-quality` (design vs. taxonomia de smell) → `.claude/agents/backend-architect.md`, `CLAUDE.md`
- [2026-09-07] Trocar alvo do contexto para `CONTEXT-DATA.md` na raiz → rename em todas as referências + gatilho de fechamento reforçado → `.claude/agents/context-keeper.md`, `CLAUDE.md`
- [2026-09-07] Criar agente de commit genérico → `committer` com agrupamento atômico e portões de segredo → `.claude/agents/committer.md`
- [2026-09-07] Mover agentes para dentro do repositório → movidos de `~/.claude/agents/`, removidos do escopo de usuário
- [2026-09-07] Criar subagentes genéricos → `context-keeper`, `sonar-quality` → `.claude/agents/`
- [2026-09-07] `/init` → guia do repositório com as restrições da fonte → `CLAUDE.md`
- [2026-09-07] Planejar monitor do SAGRES TCE-PB → levantamento da fonte + plano completo → `docs/plano.md`

## Pendências

- [ ] Fase 0: parsear os 4 datasets do ano corrente, contar linhas reais, medir ocupação em Postgres
- [ ] Validar o parser de número pt-BR contra totais conhecidos — `350.000` é ambíguo
- [ ] Decidir Postgres puro versus Postgres + DuckDB após a medição da Fase 0
- [ ] Definir se `CONTEXT-DATA.md` entra em cada commit de código ou em commit próprio
- [ ] Exercitar `prisma migrate reset` com `migrations.seed` de fato — bloqueado por `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, caminho provado hoje é `pnpm build && pnpm seed`
- [ ] Criar suite de testes automatizados — nenhuma existe no repositório
- [ ] Ingestão de `receitas` precisa tratar o código `190`: dataset 2003–2025 traz `Mataraca` em vez de `São José do Bonfim` na fonte (corrigido a partir de `receitas-2026`)
- [ ] Escrever parser de ingestão RFC-4180 (campo `descricao_receita` tem quebra de linha embutida) e remover bytes NUL de `116/despesas/despesas-2025.csv` antes do `COPY`
- [ ] Comparar valores de `descricao_subelemento` (até 2019) contra `codigo_subelemento_exibicao` (a partir de 2020) na posição 31 do layout de despesas antes de tratar como a mesma coluna no modelo
- [ ] Decidir plataforma de deploy (Vercel + cron externo vs. self-hosted único) — usuário deixou em aberto, trava o desenho final da rota de ingestão
- [ ] Escrever a Route Handler de ingestão — só existe orientação de desenho em `docs/desenho-ingestao.md`, nenhum código ainda
- [ ] Decidir se adota `no-restricted-imports` (ou equivalente) para impor a fronteira `domain/application/infra` em `app/src` — achado do `backend-architect`, sem barreira física de pacote depois do pivot
- [ ] Definir estratégia de migração em produção e fonte para `codigo_ibge` (não existe no TCE-PB)
- [ ] Confirmar com o usuário se rodar `npm run dev` a partir de `app/` (em vez da raiz) resolveu o problema relatado
- [ ] Commitar a tela inicial (mapa Leaflet) — diff em `app/` ainda não passou pelo `committer`

## Becos sem saída

- Invocar agente recém-criado via ferramenta Agent na mesma sessão — falha com `Agent type not found`; definições carregam só na inicialização.
- `WebFetch` em `dados.tce.pb.gov.br` e `dados-abertos.tce.pb.gov.br` — são SPA, retornam só o shell. Catálogo veio da listagem S3 (`?list-type=2`).
- `WebFetch` em `docs-api.tce.pb.gov.br` — HTTP 403.
- Acessar `https://download.tce.pb.gov.br/dados-abertos/dados-consolidados/` como diretório — retorna `NoSuchKey`. É bucket S3: precisa de `?list-type=2&prefix=`.
- `corepack prepare pnpm@latest --activate` em Node 22.18.0 — falha com `Cannot find module '.../pnpm/12.3.4/bin/pnpm.cjs'`; corepack 0.33.0 procura `bin/pnpm.cjs`, mas pnpm 11+ mudou para `.mjs`/binário nativo. Fixado `pnpm@10.34.5`, última versão com esse layout. Alternativa não adotada: atualizar o corepack global.
- `prisma@latest` — instala `8.0.0-rc` (release candidate) contra `@prisma/client@7.10.0` estável, par incompatível. Fixado `7.10.0` em todo o catálogo pnpm.
- Reintroduzir `url` no bloco `datasource` do `schema.prisma` — Prisma 7 removeu esse campo, gera erro `P1012`. URL de migração vive em `prisma.config.ts`; conexão de runtime entra via driver adapter.
