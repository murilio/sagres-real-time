# ADR-0004 — Colapsar o monorepo de três aplicações em um único app Next.js

> **Estado:** aceita — substitui a [ADR-0001](ADR-0001-nextjs-nestjs-prisma.md) na parte de arquitetura de serviços e a [ADR-0003](ADR-0003-prisma-7-driver-adapter.md) na parte de organização em pacotes
> **Data:** 2026-09-08

## Contexto

A arquitetura registrada até aqui era um monorepo pnpm com três aplicações e três pacotes compartilhados: `apps/api` (NestJS, REST), `apps/worker` (NestJS standalone, ingestão e motor de regras sobre filas BullMQ com Redis), `apps/web` (Next.js App Router), mais `packages/db`, `packages/shared` e `packages/ingest-core`. Essa forma está descrita na [ADR-0001](ADR-0001-nextjs-nestjs-prisma.md), seções "Contexto" e "Decisão", e a mecânica de versões e de pacotes na [ADR-0003](ADR-0003-prisma-7-driver-adapter.md).

Em 2026-09-08 o usuário pediu explicitamente a simplificação, nestes termos: *"usar apenas o nextjs, com a API no nextjs usando o prisma e tudo mais. como esse projeto é para estudos e será público"*.

Essa é a motivação registrada, e é integralmente uma decisão de contexto de projeto, não uma descoberta técnica: o projeto é de estudo e terá o código público, e nessas condições uma base de código única pesa mais do que a superfície operacional de um backend de múltiplos serviços. Esta ADR não constrói uma justificativa técnica retroativa para além disso.

O momento é o de menor custo possível para a troca: no repositório existiam apenas o pacote de banco de dados (schema, uma migração e o seed da dimensão `municipios`) e um scaffold de seis arquivos do Next.js. Nenhuma linha de NestJS, de BullMQ ou de ingestão havia sido escrita.

## Decisão

O projeto passa a ser **um único aplicativo Next.js com App Router**, sem monorepo, sem NestJS e sem Redis/BullMQ.

1. **Sem workspace.** Existe um único `package.json`, com `name: "sagres-real-time"`, em `app/package.json`. `app/pnpm-workspace.yaml`, `app/apps/` e `app/packages/` foram removidos. Os nomes de pacote `@sagres/db` e `@sagres/web` deixam de existir.
2. **A API são Route Handlers do próprio Next.js**, no App Router, e não um serviço REST separado.
3. **A ingestão diária passa a ser uma Route Handler protegida por segredo compartilhado, acionada por um cron externo** — Vercel Cron ou cron de sistema. Não há fila, não há Redis e não há processo worker separado.
4. `app/` continua sendo a pasta que contém todo o código, e a raiz do repositório continua guardando `docs/`, `README.md`, `CLAUDE.md`, `CONTEXT-DATA.md`, `.gitignore` e `.claude/`. Todo comando `pnpm` e `docker compose` continua rodando com `app/` como diretório de trabalho.

A estrutura resultante, verificada no disco em 2026-09-08:

```
app/
  package.json          manifesto único
  next.config.ts
  tsconfig.json
  prisma.config.ts
  docker-compose.yml
  .env  .env.example  .nvmrc  .npmrc
  prisma/
    schema.prisma
    migrations/20260908122955_init_municipios/
    seed/municipios-tce-pb.csv
  src/
    db.ts                 antes packages/db/src/index.ts
    generated/prisma/     saída do `prisma generate`, não versionada
    seed/municipios.ts    antes packages/db/src/seed/municipios.ts
  app/                    App Router; antes apps/web/app
    layout.tsx  page.tsx  globals.css
```

Os comandos passam a ser executados na raiz de `app/`, sem `--filter`: `pnpm dev`, `pnpm build` (`prisma generate && next build`), `pnpm typecheck`, `pnpm seed` (`tsx src/seed/municipios.ts`), `pnpm prisma:generate`, `pnpm prisma:migrate:dev`, `pnpm prisma:migrate:deploy`, `pnpm prisma:studio`, `pnpm prisma:validate`, além dos `db:*` já existentes. A lista autoritativa é `app/package.json`, bloco `scripts`.

A decisão de adotar Prisma sobre PostgreSQL ([ADR-0001](ADR-0001-nextjs-nestjs-prisma.md)), a de fixar Prisma 7.10.0 com conexão por driver adapter ([ADR-0003](ADR-0003-prisma-7-driver-adapter.md)) e a modelagem de `municipios` ([ADR-0002](ADR-0002-dimensao-municipios.md)) **permanecem válidas**. Muda o lugar onde o client vive — hoje `app/src/db.ts` — e o fato de não haver mais de um processo consumidor distinto.

## Alternativas consideradas

**Manter a arquitetura das ADR-0001 e ADR-0003: monorepo com `apps/api`, `apps/worker` e `apps/web`.** Rejeitada por decisão direta do usuário, pelo motivo citado no Contexto — projeto de estudo, código público, simplicidade da base de código acima da separação de processos. O argumento técnico que sustentava a separação continua sendo verdadeiro e não desapareceu: a ADR-0001 separava o worker da API porque a ingestão consome CPU e memória de forma intensa por alguns minutos por dia, e executá-la no mesmo processo que atende requisições degrada a latência do painel. Esse custo foi aceito conscientemente, e a forma de contê-lo é justamente o que está em aberto abaixo.

**Manter o monorepo apenas para separar `packages/db` do app web.** Não foi proposta pelo usuário e não foi adotada. Com um único consumidor do client Prisma, o pacote separado só acrescentaria um passo de build (`tsc` e `dist/`) entre o fonte e a execução — passo que a mudança justamente eliminou, como se vê no script `seed`, que hoje roda o TypeScript direto por `tsx`.

## Consequências

**Fica mais fácil.**

O passo de build intermediário desapareceu. A [ADR-0003](ADR-0003-prisma-7-driver-adapter.md) registrava como consequência negativa que "o seed é executado a partir de `dist/` e não do fonte" e que rodar o seed em um repositório recém-clonado exigia `pnpm build` antes. Com `tsx` entre as dependências e sem pacote a compilar, `pnpm seed` roda o fonte diretamente (`app/package.json`, script `seed`; `app/prisma.config.ts:31` para o caminho do `prisma migrate reset`).

Há um manifesto só, um lockfile só e uma matriz de versões só. A razão de existir do bloco `catalog:` do `pnpm-workspace.yaml` — impedir que `apps/api`, `apps/worker` e `apps/web` divergissem de versão de Prisma entre si (ADR-0003, "Decisão") — deixou de se aplicar, porque não há mais entre quem divergir.

Uma pendência inteira da ADR-0001 deixa de fazer sentido: *"o worker usa a mesma instância de client Prisma exportada por `packages/db` ou abre uma conexão separada, com pool dimensionado para a carga de ingestão?"*. Não há worker separado, então não há dois processos disputando o `max_connections` do Postgres. A opção de receber um pool `pg` externo em `app/src/db.ts` continua existindo e continua útil pelo outro motivo que a ADR-0003 dá: o `COPY` da ingestão roda no driver `pg`, não no client gerado, e compartilhar o pool evita abrir dois conjuntos de conexões.

O deploy deixa de ter duas formas. A ADR-0001 previa web na Vercel e API e worker em contêiner; agora é um artefato só.

**Fica mais difícil.**

A ingestão e o atendimento de requisições passam a viver no mesmo runtime. O problema que a separação de worker resolvia continua existindo e agora precisa ser resolvido dentro das restrições de uma Route Handler.

Deixam de existir barreiras físicas de dependência. `packages/shared` e `packages/ingest-core` eram, além de unidades de reúso, fronteiras que o gerenciador de pacotes fazia cumprir; num app único a disciplina de camadas depende de convenção de diretório e de revisão, não de erro de resolução de módulo.

Não há mais fila. Repetição, backoff e retomada de uma ingestão interrompida — que o BullMQ entregava pronto — passam a ser responsabilidade do desenho da própria rota e do estado gravado no Postgres.

**Passa a ser obrigatório.**

Toda documentação que cite caminho de pacote (`packages/db`, `apps/web`) ou comando com `--filter @sagres/...` está errada e precisa ser corrigida. Os documentos alcançados por esta mudança são `docs/plano.md` (seção 2), `docs/guia-ambiente-local.md`, `docs/referencia/dimensao-municipios.md`, `docs/referencia/layout-csv-sagres.md`, `docs/procedencia-municipios.md` e `docs/README.md`.

## Verificação

Executado nesta ordem em 2026-09-08, a partir de `app/`, depois da migração dos arquivos:

| Comando | Resultado |
|---|---|
| `pnpm install` | concluído |
| `pnpm prisma:generate` | client gerado em `app/src/generated/prisma` |
| `pnpm typecheck` | sem erro |
| `pnpm prisma:migrate:deploy` | `No pending migrations to apply` |
| `pnpm seed` | `223 linhas lidas`; `0 inseridos, 0 atualizados, 223 na tabela` |
| `pnpm build` | `next build` compilou e gerou a rota estática `/` |

O banco e a dimensão `municipios` atravessaram a reorganização intactos, e a idempotência do seed se manteve.

## Pendências

- **O desenho da Route Handler de ingestão — parcialmente respondido em 2026-09-08, como orientação e não como decisão.** A decisão registrada nesta ADR é *que* a ingestão é uma rota acionada por cron externo e protegida por segredo compartilhado; *como* ela se sustenta continua sem ADR própria, porque nada disso foi implementado — não existe Route Handler de ingestão no código. A revisão de arquitetura de backend feita em 2026-09-08 respondeu duas das três perguntas e deixou a terceira condicionada. As orientações resultantes estão em [`../desenho-ingestao.md`](../desenho-ingestao.md); elas devem ser seguidas quando a rota for escrita, e viram ADR própria quando forem de fato adotadas no código. Situação por pergunta:
  1. **Tempo de execução — condicionado à plataforma de deploy, que segue `A DEFINIR`.** Há orientação escrita para os dois ramos (Vercel e self-hosted), mas nenhum foi escolhido: perguntado em 2026-09-08, o usuário respondeu explicitamente que a plataforma ainda não está decidida e deve permanecer em aberto. Ver [`../desenho-ingestao.md`](../desenho-ingestao.md), seção 1. O ponto comum aos dois ramos é que o trabalho pesado não roda dentro da Route Handler: ela é gatilho fino, e o processamento fica num binário chamado pelo cron.
  2. **Proteção do endpoint — respondida.** Segredo em cabeçalho `Authorization: Bearer`, comparação em tempo constante sobre hashes, falha fechada quando a variável de ambiente falta, sem cache na resposta. Ver [`../desenho-ingestao.md`](../desenho-ingestao.md), seção 3.
  3. **Exclusão mútua — respondida.** Advisory lock de sessão do Postgres em conexão dedicada, `409` quando já tomado, idempotência pelo `ETag` da fonte, e a cláusula `WHERE ... row_hash IS DISTINCT FROM ...` no merge como requisito de corretude. Ver [`../desenho-ingestao.md`](../desenho-ingestao.md), seção 2.
- **A DEFINIR: a plataforma de deploy.** Aberta por resposta explícita do usuário em 2026-09-08. Enquanto não for decidida, o desenho de execução da ingestão tem dois ramos e nenhum escolhido.
- **A DEFINIR:** herdada da [ADR-0001](ADR-0001-nextjs-nestjs-prisma.md) e ainda aberta — qual é a estratégia de migração em produção, dado que parte do schema (partições, materialized views, `CHECK` escritos à mão) não é gerada pelo Prisma?
- **A DEFINIR:** herdada da [ADR-0002](ADR-0002-dimensao-municipios.md) e ainda aberta — se e quando surgir fonte pública para o `codigo_ibge`, a coluna entra na dimensão.
- **A DEFINIR:** herdada da [ADR-0003](ADR-0003-prisma-7-driver-adapter.md), agora reduzida — as versões de Next.js e React declaradas em `app/package.json` são as do scaffold e ainda não foram objeto de decisão registrada. A pendência de versão de NestJS desapareceu junto com o NestJS.
- **A DEFINIR:** herdada da [ADR-0001](ADR-0001-nextjs-nestjs-prisma.md) e ainda aberta — haverá camada de leitura analítica separada (Postgres puro versus Postgres + DuckDB), decisão prevista para a Fase 0 (`../plano.md`, seção 8).
