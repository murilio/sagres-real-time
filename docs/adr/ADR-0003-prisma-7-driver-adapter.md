# ADR-0003 — Fixar Prisma 7.10.0 e conectar por driver adapter `@prisma/adapter-pg`

> **Estado:** parcialmente superada pela [ADR-0004](ADR-0004-nextjs-unico.md) — a organização em pacotes de workspace foi desfeita; as versões fixadas e a conexão por driver adapter permanecem válidas
> **Data:** 2026-09-08

Complementa a [ADR-0001](ADR-0001-nextjs-nestjs-prisma.md), que decidiu adotar o Prisma como ORM e permanece válida. Esta ADR não revê aquela decisão: registra a versão fixada e as mudanças de mecânica que a versão 7 impõe, que não eram conhecidas quando a ADR-0001 foi escrita.

**Nota de manutenção, 2026-09-08 (posterior).** A [ADR-0004](ADR-0004-nextjs-unico.md) desfez o monorepo: o usuário pediu explicitamente um único app Next.js, porque o projeto é de estudo e o código será público. O que esta ADR decide sobre **versões fixadas** (Prisma 7.10.0, `@prisma/adapter-pg` 7.10.0, `pg` 8.23.0, Node 22.18.0, pnpm 10.34.5, TypeScript 5.9.3) e sobre a **conexão obrigatória por driver adapter** continua valendo integralmente. O que mudou é onde as coisas moram, e vale para todo caminho citado no corpo abaixo:

| Citado abaixo | Hoje |
|---|---|
| `packages/db/src/index.ts` | `app/src/db.ts` |
| `packages/db/src/generated/prisma` | `app/src/generated/prisma` (`.gitignore:13`) |
| `packages/db/prisma.config.ts` | `app/prisma.config.ts` |
| `packages/db/prisma/...` | `app/prisma/...` |
| `pnpm-workspace.yaml`, bloco `catalog:` | não existe; as versões estão em `app/package.json`, e não há mais pacotes entre os quais divergir |
| `onlyBuiltDependencies` em `pnpm-workspace.yaml` | bloco `pnpm.onlyBuiltDependencies` em `app/package.json` |
| `.nvmrc`, `.npmrc` | `app/.nvmrc`, `app/.npmrc` |
| `apps/web` | não existe; o App Router é `app/app/` |
| build `prisma generate && tsc` de `packages/db` | `pnpm build` = `prisma generate && next build`; o seed roda o fonte por `tsx`, sem `dist/` |

O `.gitignore` e o `.env` seguem como a nota anterior descrevia: o `.gitignore` continua na raiz do repositório e o `.env` que `prisma.config.ts` resolve é `app/.env`. O texto da decisão não foi alterado.

**Nota de manutenção, 2026-09-08 (anterior à ADR-0004).** O monorepo pnpm passou a viver na pasta `app/` do repositório, e os caminhos de pacote citados abaixo eram lidos com o prefixo `app/`. Superada pela tabela acima.

## Contexto

A ADR-0001 deixou explícito como pendência quais versões de Prisma, Next.js, NestJS e Node seriam fixadas no monorepo. Ao montar `packages/db`, a versão precisou ser escolhida, e a escolha de Prisma 7 trouxe duas mudanças de comportamento que afetam o que a ADR-0001 descreve.

**Primeira mudança: o bloco `datasource` não aceita mais `url`.** Declarar `url` em `schema.prisma` faz o CLI falhar com o erro `P1012`. A URL usada pelo CLI para migração e introspecção passa a viver em um arquivo de configuração próprio, e a conexão de runtime da aplicação passa **obrigatoriamente** por um *driver adapter* — o `PrismaClient` não abre conexão sozinho a partir do schema.

**Segunda mudança: o `generator client` emite código-fonte TypeScript,** não um pacote JavaScript pré-compilado dentro de `node_modules`. A saída é um diretório de arquivos `.ts` que passa a fazer parte da compilação do pacote.

Uma terceira restrição vem do gerenciador de pacotes, não do Prisma: o pnpm 10 bloqueia por padrão a execução de script de build de dependência. O Prisma precisa do seu para preparar o *query engine*. Sem autorização explícita, o `install` termina reportando sucesso e o client falha em tempo de execução.

## Decisão

Fixar `prisma`, `@prisma/client` e `@prisma/adapter-pg` na versão **7.10.0**, e `pg` na **8.23.0**, declaradas uma única vez no bloco `catalog:` de `pnpm-workspace.yaml` e referenciadas por `catalog:` nos pacotes, para que `apps/api`, `apps/worker` e `apps/web` não divirjam de versão entre si.

Fixar também o restante do ambiente: Node **22.18.0** (`.nvmrc`, com `engines` na raiz e `engine-strict=true` em `.npmrc`), pnpm **10.34.5** via `packageManager`, TypeScript **5.9.3**.

`packages/db` passa a declarar `@prisma/adapter-pg` e `pg` como dependências de runtime, além de `@prisma/client`. A conexão é criada em `packages/db/src/index.ts`, que exporta um construtor de client aceitando uma string de conexão **ou um pool `pg` já existente**.

A URL de migração fica em `packages/db/prisma.config.ts`, que carrega o `.env` da raiz do monorepo com `process.loadEnvFile` antes de avaliar a configuração — o CLI do Prisma 7 não carrega o `.env` sozinho, e o `.env` da raiz é a fonte única de credencial do monorepo.

O build de `packages/db` passa a ser `prisma generate && tsc`. A saída do gerador vai para `packages/db/src/generated/prisma` e **não é versionada** (`.gitignore:13`), por ser derivada do schema.

`@prisma/engines` e `prisma` são autorizados a executar script de build em `onlyBuiltDependencies` (`pnpm-workspace.yaml`).

Next.js e NestJS continuam sem versão decidida por esta ADR — ver Pendências.

## Alternativas consideradas

**Permanecer no Prisma 6, onde `datasource.url` ainda funciona.** Rejeitada. Adiar a migração não elimina o trabalho, apenas o move para um momento em que já existirão `apps/api` e `apps/worker` consumindo o client, tornando a mudança mais cara. O repositório tem hoje um único pacote consumindo o Prisma e uma única tabela: é o momento de menor custo possível para absorver a quebra.

**Usar o driver adapter apenas onde for necessário, mantendo conexão pelo schema no resto.** Não é uma alternativa real na versão 7: o adapter é o único caminho de conexão de runtime.

**Não expor a opção de pool externo em `createPrismaClient`.** Rejeitada por duas razões concretas, ambas ligadas à ADR-0001. O caminho de ingestão em massa usa `COPY`, que roda no driver `pg` e não no client gerado; sem compartilhar o pool, o processo abriria dois conjuntos de conexões contra o mesmo Postgres. E a ADR-0001 deixa em aberto se o worker usa a mesma instância de client da API ou um pool dimensionado para a carga de ingestão — aceitar um pool externo permite decidir isso no chamador, sem alterar `packages/db`.

**Versionar o client gerado.** Rejeitada: é artefato derivado do schema, e versioná-lo cria uma segunda fonte de verdade que diverge silenciosamente do `schema.prisma` a cada migração esquecida.

## Consequências

**Fica mais fácil.** A criação do client fica em um ponto só, `packages/db/src/index.ts`, com o pool explícito e dimensionável. O `COPY` da ingestão e as consultas do ORM podem compartilhar o mesmo pool, o que torna o teto de conexões um número que se calcula — réplicas × `connection_limit` tem de caber no `max_connections` do Postgres — em vez de uma soma difusa de pools escondidos.

**Fica mais difícil.** `packages/db` ganhou duas dependências de runtime que a ADR-0001 não previa (`@prisma/adapter-pg` e `pg`) e uma de tipos (`@types/pg`). Existem agora dois lugares que precisam concordar sobre como chegar ao banco: `prisma.config.ts`, usado pelo CLI, e o adapter em `src/index.ts`, usado pela aplicação. Eles leem a mesma variável `DATABASE_URL`, mas por caminhos diferentes — divergência entre os dois aparece como "a migração roda e a aplicação não conecta", ou o contrário.

O build deixou de ser só `tsc`. `prisma generate` tem de rodar antes, e o diretório gerado precisa existir para o TypeScript compilar. Consequência prática já visível: o seed é executado a partir de `dist/` e não do fonte, porque não há runner de TypeScript entre as dependências — rodar o seed em um repositório recém-clonado exige `pnpm build` antes.

Um `pnpm install` feito sem a autorização de `onlyBuiltDependencies` produz uma instalação que reporta sucesso e falha em tempo de execução. Isso torna `pnpm-workspace.yaml` um arquivo cuja edição descuidada quebra o ambiente de forma não óbvia.

**Passa a ser obrigatório.** Nenhum código de aplicação instancia `PrismaClient` diretamente: o construtor de `packages/db` é o único caminho, porque é ele que injeta o adapter. Toda documentação de setup precisa incluir o passo de build antes de qualquer comando que dependa do client gerado.

## Pendências

- **A DEFINIR:** qual versão de Next.js será fixada? *(2026-09-08: a pendência de NestJS ficou sem objeto — a [ADR-0004](ADR-0004-nextjs-unico.md) removeu o NestJS do projeto. O scaffold que declarava `next` 16.3.4 e `react` 19.2.8 deixou de ser `apps/web` e virou o app único; essas versões estão hoje em `app/package.json`, mas foram herdadas do scaffold e não são objeto de decisão registrada.)*
- ~~**A DEFINIR:** herdada da ADR-0001 — o worker usa a mesma instância de client exportada por `packages/db` ou abre um pool separado, dimensionado para a carga de ingestão?~~ **Sem objeto desde 2026-09-08**, pela [ADR-0004](ADR-0004-nextjs-unico.md): não há worker separado. A assinatura de `createPrismaClient` (`app/src/db.ts`) continua aceitando pool externo, pela razão do `COPY` no driver `pg`.
- **A DEFINIR:** herdada da ADR-0001 e ainda aberta — qual é a estratégia de migração em produção, dado que parte do schema (partições, materialized views, `CHECK` escritos à mão) não é gerada pelo Prisma?
