# ADR-0001 — Adotar Next.js no front, NestJS no backend e Prisma como ORM

> **Estado:** aceita
> **Data:** 2026-09-08

## Contexto

O `docs/plano.md:5` já registrava, desde o levantamento inicial, que o front seria feito em Next.js e a API em NestJS. Essa parte da stack não estava em disputa. O que permanecia em aberto era a camada de acesso ao banco: o `docs/plano.md:108` descrevia o pacote `db/` como "schema, migrações, client (Prisma ou Drizzle)", deixando explícita uma escolha pendente entre dois ORMs.

A arquitetura planejada é um monorepo pnpm com três aplicações e três pacotes compartilhados (`docs/plano.md:100-111`). Duas dessas aplicações acessam o banco: `apps/api`, um serviço NestJS REST, e `apps/worker`, um processo NestJS standalone que executa a ingestão diária e o motor de regras sobre filas BullMQ. O worker foi separado da API justamente porque a ingestão consome CPU e memória de forma intensa por alguns minutos por dia, e manter isso no mesmo processo que atende requisições degradaria a latência do painel (`docs/plano.md:113`).

O banco é PostgreSQL 16, com particionamento por ano nas tabelas grandes, e o Redis atende as filas do BullMQ. O deploy previsto coloca a aplicação web na Vercel e a API e o worker em contêiner (seção "Infraestrutura" do `docs/plano.md`).

Duas propriedades da fonte de dados, descritas em `CLAUDE.md` na seção "Data constraints that drive the design", condicionam qualquer escolha de camada de dados. Primeiro, os arquivos publicados pelo TCE-PB são snapshots completos e não trazem identificador estável de linha, o que obriga a ingestão a calcular uma chave de negócio sintética e um `row_hash` da linha inteira, e a operar por um passo de carga em staging seguido de merge. Segundo, os municípios fazem correções retroativas em remessas de anos anteriores, o que torna o histórico versionado das linhas alteradas uma tabela central do modelo e não um recurso acessório.

## Decisão

Adotar Next.js na aplicação web, NestJS na API e no worker, e Prisma como ORM sobre o PostgreSQL.

O pacote `packages/db` passa a ser o dono do arquivo `schema.prisma`, do diretório de migrações e do client Prisma exportado. As aplicações `apps/api` e `apps/worker` consomem o client a partir desse pacote e não declaram dependência direta do Prisma.

O Prisma atende as consultas da API e do painel. O caminho de ingestão em massa não passa pelo client gerado linha a linha: a carga para as tabelas de staging usa `COPY` e o merge de staging para as tabelas fato é executado como comando SQL em lote, via `$executeRaw` ou equivalente.

## Alternativas consideradas

**Drizzle.** Era a alternativa explicitamente registrada no plano. Foi descartada por decisão direta do usuário nesta sessão, que fechou a escolha em Prisma. Não houve comparação técnica formal entre os dois, e esta ADR não constrói uma retroativamente.

**SQL puro sem ORM.** Não chegou a ser proposta. A superfície de leitura descrita para a API é ampla — treze módulos com filtros combináveis e paginação por cursor (`docs/plano.md:218-226`) — e escrever e manter esse acesso à mão custaria mais do que o overhead do ORM. A decisão preserva o acesso direto ao SQL exatamente onde ele importa, que é o caminho de ingestão.

## Consequências

**Fica mais fácil.** As consultas de leitura da API e do painel ganham tipagem derivada do schema, o que reduz o risco de divergência entre o modelo do banco e os DTOs de `packages/shared`. O schema passa a ter uma representação única e versionada, com um fluxo de migração padronizado.

**Fica mais difícil.** O particionamento por ano das tabelas `empenhos` e `folha_mensal` (`docs/plano.md:184`) não é expressável no schema declarativo do Prisma. Essas tabelas exigem migração SQL escrita à mão, e o `schema.prisma` precisa conviver com objetos de banco que ele não gera nem gerencia — o que inclui, além das partições, as materialized views de agregação e os índices GIN de `pg_trgm` previstos na seção de performance do plano. Toda alteração nessas estruturas precisa ser aplicada por SQL e refletida manualmente no schema, e qualquer comando do Prisma que reconstrua o banco a partir do schema declarativo produzirá um banco incompleto.

**Passa a ser obrigatório.** O caminho de ingestão em massa usa SQL cru. Carregar centenas de MB por arquivo através do client Prisma, registro a registro, não é uma opção — a carga em staging usa `COPY` e o merge usa comando em lote. Consequentemente, a parte mais crítica e mais propensa a erro do sistema, o passo de staging-then-merge que produz os eventos `registro_novo`, `registro_alterado` e `registro_removido` (`docs/plano.md:139-142`), fica fora da cobertura de tipos do ORM e precisa de teste próprio contra o banco real.

Além disso, a existência de dois caminhos de escrita e leitura sobre as mesmas tabelas — o SQL da ingestão e o client do Prisma — exige disciplina para que o schema declarativo continue descrevendo fielmente o que o SQL criou. Divergência entre os dois se manifesta como erro em tempo de execução na API, não em tempo de migração.

## Pendências

- **A DEFINIR:** quais versões de Prisma, Next.js, NestJS e Node serão fixadas no monorepo?
- **A DEFINIR:** o worker usa a mesma instância de client Prisma exportada por `packages/db` ou abre uma conexão separada, com pool dimensionado para a carga de ingestão?
- **A DEFINIR:** qual é a estratégia de migração em produção — `prisma migrate deploy`, ou SQL aplicado por outra via, dado que parte do schema (partições, materialized views) não é gerada pelo Prisma?
- **A DEFINIR:** haverá camada de leitura analítica separada? O plano ainda mantém em aberto a decisão entre Postgres puro e Postgres + DuckDB, prevista para ser resolvida na Fase 0 (`docs/plano.md:248`).
