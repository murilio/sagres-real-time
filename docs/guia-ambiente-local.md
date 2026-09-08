# Guia — subir o ambiente local e popular o banco

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem está clonando o repositório pela primeira vez ou precisa recriar o banco de desenvolvimento

Passo a passo para deixar o Postgres local de pé, aplicar a migração e popular a dimensão `municipios`. Todos os comandos abaixo existem no repositório — conferidos no bloco `scripts` de `app/package.json`, que é o único manifesto do projeto.

Este guia cobre apenas o que existe hoje: o banco, a dimensão `municipios` e o app Next.js com a tela inicial do painel. **Não há ingestão, API de dados nem motor de regras para rodar.**

## Diretório de trabalho

O código vive em `app/`, e não na raiz do repositório. `package.json`, `pnpm-lock.yaml`, `docker-compose.yml`, `.env`, `.nvmrc`, `.npmrc`, `next.config.ts`, `tsconfig.json` e `prisma.config.ts` estão todos dentro de `app/`. **Todo comando deste guia é executado com `app/` como diretório de trabalho:**

```bash
cd app
```

Fora de `app/` o `pnpm` não encontra o manifesto e o `docker compose` não encontra o arquivo de serviços. Permanecem na raiz do repositório, e só lá: `.gitignore`, `README.md`, `CLAUDE.md`, `CONTEXT-DATA.md`, `.claude/` e `docs/`.

Não há mais monorepo pnpm: nenhum comando usa `--filter`, e os nomes de pacote `@sagres/db` e `@sagres/web` deixaram de existir. Ver [`adr/ADR-0004-nextjs-unico.md`](adr/ADR-0004-nextjs-unico.md).

## Pré-requisitos

| Ferramenta | Versão exigida | Onde está fixada |
|---|---|---|
| Node | 22.18.0 | `app/.nvmrc`; `engines` em `app/package.json` |
| pnpm | 10.34.5 | `packageManager` em `app/package.json` |
| Docker com Compose | qualquer versão que rode `docker compose` | — |

O `app/.npmrc` liga `engine-strict=true`: com um Node fora da faixa declarada, o `install` falha em vez de seguir e quebrar mais adiante.

## 1. Configurar o ambiente

```bash
cp .env.example .env
```

O `.env` real, criado em `app/.env`, é ignorado pelo git (`.gitignore:16` — o `.gitignore` continua na raiz do repositório); apenas o `app/.env.example` é versionado, e ele traz somente senha de desenvolvimento local. As quatro variáveis de Postgres e a `DATABASE_URL` precisam permanecer coerentes entre si — a URL é lida tanto pelo CLI do Prisma quanto pela aplicação.

## 2. Instalar dependências

```bash
pnpm install
```

## 3. Subir o Postgres

```bash
pnpm db:up      # docker compose up -d postgres
pnpm db:logs    # acompanha o log, se precisar
```

O contêiner é `postgres:16.10-alpine`, com a tag de patch fixa, publicado apenas em `127.0.0.1` na porta definida por `POSTGRES_PORT` (padrão `5432`). O banco é criado com encoding UTF-8 e locale `C`. O `healthcheck` usa `pg_isready`; qualquer passo que dependa do banco deve esperar por ele, não por um `sleep` arbitrário.

O `app/docker-compose.yml` fixa o nome do projeto Compose em `sagres-real-time` (`app/docker-compose.yml:3`). Sem essa linha o Compose deriva o nome do projeto do nome do diretório — que é `app` — e cria a rede como `app_default`, junto de containers com prefixo `app`. Se o seu ambiente foi criado antes dessa linha existir, o container antigo precisa ser removido à mão para que ele seja recriado sob o nome fixado. O volume não é afetado: ele tem nome explícito, `sagres-postgres-data` (`app/docker-compose.yml:43`), e sobrevive à troca de nome do projeto — na recriação feita em 2026-09-08 os 223 municípios continuaram na tabela.

## 4. Gerar o client Prisma

```bash
pnpm prisma:generate
```

O `prisma generate` produz o client em `app/src/generated/prisma`, que não é versionado (`.gitignore:13`). Ele precisa existir antes de qualquer comando que use o client — inclusive o `pnpm typecheck`, porque o código gerado é TypeScript e entra na compilação (ver [`adr/ADR-0003-prisma-7-driver-adapter.md`](adr/ADR-0003-prisma-7-driver-adapter.md)). O `pnpm build` já roda `prisma generate` antes do `next build`.

Não há mais passo de compilação para `dist/`: o seed executa o fonte TypeScript diretamente, por `tsx`.

## 5. Aplicar as migrações

```bash
pnpm prisma:migrate:dev      # desenvolvimento
pnpm prisma:migrate:deploy   # aplica sem gerar migração nova
```

## 6. Popular a dimensão `municipios`

```bash
pnpm seed      # tsx src/seed/municipios.ts
```

Saída em um banco recém-migrado: `223 inseridos, 0 atualizados, 223 na tabela`. Reexecutar o comando com o mesmo CSV não insere nem atualiza nada — executado em 2026-09-08 contra o banco já populado, o resultado foi `223 linhas lidas` e `0 inseridos, 0 atualizados, 223 na tabela`.

O seed também roda sozinho em `prisma migrate reset`, configurado em `app/prisma.config.ts:31`, para que resetar o banco não deixe a dimensão vazia.

## 7. Conferir

```bash
pnpm db:psql    # abre psql dentro do contêiner
```

```sql
SELECT count(*) FROM municipios;   -- 223

-- checagem de buraco na sequência; contagem sozinha não basta
SELECT s.n
FROM generate_series(1, 223) s(n)
LEFT JOIN municipios m ON m.codigo_tce = lpad(s.n::text, 3, '0')
WHERE m.codigo_tce IS NULL;        -- nenhuma linha
```

## 8. Rodar o app

```bash
pnpm dev        # next dev
```

O comando precisa ser executado com `app/` como diretório de trabalho, como todos os outros deste guia. Rodá-lo na raiz do repositório falha, porque não existe `package.json` na raiz. Em 2026-09-08 foi confirmado que tanto `pnpm dev` quanto `npm run dev` funcionam a partir de `app/`.

O que existe hoje é a tela inicial do painel: um mapa da Paraíba, com imagens de fundo do OpenStreetMap, sem nenhum dado do banco plugado — ver [`referencia/tela-mapa-paraiba.md`](referencia/tela-mapa-paraiba.md). Nenhuma outra tela e nenhuma Route Handler foram escritas.

### O Next.js 16 gera `AGENTS.md` e `CLAUDE.md`, e isso está desligado

Por padrão, o Next.js 16 escreve automaticamente `AGENTS.md` e `CLAUDE.md` dentro de `app/` a cada `next dev` ou `next build`. Esses arquivos colidiriam com o `CLAUDE.md` real do projeto, que vive na raiz do repositório e carrega as convenções deste repositório: uma ferramenta que resolva o arquivo de instrução mais próximo do diretório de trabalho leria o gerado pelo Next.js em vez do verdadeiro.

A geração está desligada pela flag `agentRules: false` em `app/next.config.ts:9`. Os dois arquivos gerados antes da flag foram apagados à mão em 2026-09-08, e foi confirmado que não voltam a aparecer depois de rodar `next dev` e `next build` com a flag ativa.

Se você encontrar `app/AGENTS.md` ou `app/CLAUDE.md` no diretório de trabalho, não os edite nem os versione: apague-os e confira se a flag continua no `next.config.ts`.

## Recomeçar do zero

```bash
pnpm db:reset   # docker compose down -v && docker compose up -d postgres
```

O `-v` apaga o volume `sagres-postgres-data`. É destrutivo e não pede confirmação. Depois dele, repita os passos 5 e 6.

## Outros comandos disponíveis

| Comando | O que faz |
|---|---|
| `pnpm db:down` | para o contêiner, preservando o volume |
| `pnpm typecheck` | `tsc --noEmit`; exige o client gerado (passo 4) |
| `pnpm build` | `prisma generate && next build` |
| `pnpm start` | `next start`, sobre um build já produzido |
| `pnpm prisma:validate` | valida o `schema.prisma` sem tocar o banco |
| `pnpm prisma:studio` | abre o Prisma Studio |

## Ressalva sobre reprodutibilidade

Em 2026-09-08, o `app/pnpm-lock.yaml` existe no diretório de trabalho mas **ainda não está versionado no git** — `git status` mostra a pasta `app/` inteira como não rastreada. Enquanto isso não mudar, dois clones do repositório podem resolver árvores de dependência diferentes, e as versões citadas neste guia valem para a máquina onde o arquivo foi gerado, não para um clone novo.

O lockfile em si está coerente com o manifesto: em 2026-09-08, depois da reorganização para app único, um `pnpm install --frozen-lockfile` executado a partir de `app/` termina sem erro e sem alterações.
