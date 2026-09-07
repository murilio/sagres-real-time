# Contexto — sagres-real-time

Atualizado: 2026-09-07

## Estado atual

Projeto em planejamento. Nenhum código de aplicação existe: sem `package.json`, sem build, sem teste, sem banco.
Repositório contém plano de arquitetura (`docs/plano.md`), guia para o Claude Code (`CLAUDE.md`) e três subagentes em `.claude/agents/`.
Fonte de dados verificada por acesso real em 2026-09-07: bucket S3 público do TCE-PB, listável, sem token, arquivos do ano corrente regerados diariamente ~03:00.
Schemas dos quatro datasets (despesas, licitações, receitas, servidores) lidos de amostras baixadas — colunas confirmadas.
Os três agentes estão implementados, **nenhum foi executado como subagente ainda (não verificado)** — definições em `.claude/agents/` só carregam na inicialização do Claude Code.

## Stack

Nada instalado. Planejado: Next.js (front), NestJS (API e worker), PostgreSQL, Redis/BullMQ, monorepo pnpm.

## Decisões

- [2026-09-07] Usar os dados abertos em S3, não a SAGRES Captura API — a API exige token da ASTEC só para empresas cadastradas.
- [2026-09-07] Ingerir os 4 arquivos consolidados, não os 892 por município — mesma cobertura, 4 downloads.
- [2026-09-07] MVP com 2024–2026; histórico 2003+ fica para a Fase 4 — volume estimado em 60–100M linhas.
- [2026-09-07] Chave de negócio sintética + `row_hash` por linha — nenhum dataset traz identificador estável.
- [2026-09-07] Tabela de versões de registro alterado — é o diferencial sobre o portal do TCE, que só mostra o snapshot atual.
- [2026-09-07] Agentes em `.claude/agents/` do projeto, não em `~/.claude/agents/` — versionamento e controle junto do código.
- [2026-09-07] Estado do projeto em `CONTEXT-DATA.md` na raiz, separado de `CLAUDE.md` — instrução e estado não se misturam.
- [2026-09-07] Mensagens de commit em inglês — repositório não tinha convenção estabelecida.

## Demandas

- [2026-09-07] Trocar alvo do contexto para `CONTEXT-DATA.md` na raiz → rename em todas as referências + gatilho de fechamento reforçado → `.claude/agents/context-keeper.md`, `CLAUDE.md`
- [2026-09-07] Criar agente de commit genérico → `committer` com agrupamento atômico e portões de segredo → `.claude/agents/committer.md`
- [2026-09-07] Mover agentes para dentro do repositório → movidos de `~/.claude/agents/`, removidos do escopo de usuário
- [2026-09-07] Criar subagentes genéricos → `context-keeper`, `sonar-quality` → `.claude/agents/`
- [2026-09-07] `/init` → guia do repositório com as restrições da fonte → `CLAUDE.md`
- [2026-09-07] Planejar monitor do SAGRES TCE-PB → levantamento da fonte + plano completo → `docs/plano.md`

## Pendências

- [ ] Reiniciar o Claude Code para carregar os agentes de `.claude/agents/`
- [ ] Fase 0: parsear os 4 datasets do ano corrente, contar linhas reais, medir ocupação em Postgres
- [ ] Validar o parser de número pt-BR contra totais conhecidos — `350.000` é ambíguo
- [ ] Decidir Postgres puro versus Postgres + DuckDB após a medição da Fase 0
- [ ] Definir se `CONTEXT-DATA.md` entra em cada commit de código ou em commit próprio

## Becos sem saída

- Invocar agente recém-criado via ferramenta Agent na mesma sessão — falha com `Agent type not found`; definições carregam só na inicialização.
- `WebFetch` em `dados.tce.pb.gov.br` e `dados-abertos.tce.pb.gov.br` — são SPA, retornam só o shell. Catálogo veio da listagem S3 (`?list-type=2`).
- `WebFetch` em `docs-api.tce.pb.gov.br` — HTTP 403.
- Acessar `https://download.tce.pb.gov.br/dados-abertos/dados-consolidados/` como diretório — retorna `NoSuchKey`. É bucket S3: precisa de `?list-type=2&prefix=`.
