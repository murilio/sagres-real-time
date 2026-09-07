# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-implementation. The repository contains only planning material — there is no application code, package manifest, build, lint, or test setup yet. Do not invent commands for tooling that does not exist; when the first app is scaffolded, replace this section with the real commands.

`docs/plano.md` is the source of truth for scope, architecture, data model, roadmap and risks. Read it before proposing structural changes.

## What this project is

A watchdog application over the open data published by the Paraíba State Court of Accounts (TCE-PB) from its SAGRES system, covering expenses, procurements, revenues and payroll for all 223 municipalities of the state. Daily ingestion, public dashboard, and a rules engine that raises fiscalization signals.

Planned stack: Next.js (front), NestJS (API and worker), PostgreSQL, Redis/BullMQ, pnpm workspaces monorepo (`apps/api`, `apps/worker`, `apps/web`, `packages/db`, `packages/shared`, `packages/ingest-core`).

The dashboard alone reproduces what TCE-PB already publishes. The rules engine and the change-history tracking are what make the product distinct — weight design decisions accordingly.

## Data source (verified 2026-09-07)

Public, listable S3 bucket. No token, no authentication, no scraping needed:

```
https://download.tce.pb.gov.br/dados-abertos/
  dados-consolidados/{despesas,licitacoes,receitas,servidores}/{dataset}-{year}.zip
  dados-por-municipio/{001..223}/{dataset}/{dataset}-{year}.zip
```

Catalog listing uses the standard S3 API:

```
curl "https://download.tce.pb.gov.br/dados-abertos/?list-type=2&max-keys=1000&prefix=dados-consolidados/"
```

Coverage: despesas and receitas from 2003, servidores from 2013, licitacoes from 2015, all through the current year. 3.54 GB compressed in total.

Each ZIP holds one CSV: `;` separated, UTF-8 **with BOM**, dates `dd/MM/yyyy`, numbers in pt-BR format (`25.499,48`) with decimals omitted when zero (`8.748`, `485`).

Current-year files are regenerated daily around 03:00 local (06:00 UTC). Closed years are frozen but do get bulk-reprocessed (the 2003–2025 set was rewritten in Feb 2026). `Last-Modified` and `ETag` from a `HEAD` request are the ingestion trigger.

Prefer the four consolidated files over the 892 per-municipality ones — same coverage, four downloads. The per-municipality files exist for parallel backfill and for surgical reload of a single municipality.

There is also a SAGRES Captura API at `https://sagrescaptura.tce.pb.gov.br/api`, but it requires a token issued by TCE-PB's ASTEC to registered companies only. The open data covers the project's scope; do not build against that API.

## Data constraints that drive the design

These are properties of the source, not choices — code that ignores them will be silently wrong.

1. **No stable row identifier in any dataset.** Every fact table needs a synthetic business key plus a `row_hash` of the full row. Expense key is `unidade_gestora + ano + numero_empenho`.
2. **Files are full snapshots, not increments.** Each daily file replaces the year. "New" and "changed" exist only as a diff against the database state, computed in a staging-then-merge step.
3. **Retroactive corrections happen.** Municipalities amend prior-year submissions. Watching only the current year misses them — and a retroactively altered expense is itself a high-value signal, which is why versioned history of changed rows is a core table, not a nice-to-have.
4. **Payroll CPF arrives masked** (`***.539.694-**`). Payroll cannot be joined to creditors by document number; only by name and `matricula`, with homonym risk. Creditor and bidder CNPJ/CPF come complete, which is what enables supplier network analysis (group by the 8-digit CNPJ root).
5. **The CSV layout carries no compatibility guarantee.** Validate the header against a versioned layout contract on every ingestion and fail loudly rather than parsing a shifted column.
6. **Round values are ambiguous** (`350.000`). Validate the pt-BR number parser against known totals before trusting any aggregate.

## Domain vocabulary

Column names and enum values in the data are Portuguese and should stay verbatim in parsers and database columns. Key terms: *unidade gestora* (managing unit, the reporting entity), *empenho* (commitment, the expense record grain), *valor empenhado / liquidado / pago* (three stages of expense execution, tracked separately), *natureza / elemento de despesa* (expense classification), *dispensa / inexigibilidade* (procurement exceptions that bypass bidding — central to several detection rules), *remessa* (a municipality's periodic data submission to TCE).

## Editorial constraint

Every alert the product raises is an *indício* — an indication, not a proven irregularity. Any UI, API response, or export carrying an alert must ship the rule's methodology, the underlying rows as evidence, and a link back to the source data. This is a product requirement, not a disclaimer to bolt on later.

## Subagents in this repository

`.claude/agents/` holds six project-scoped agents, versioned with the code. They are written to be domain-agnostic — nothing in them references SAGRES — so they can be copied to `~/.claude/agents/` or packaged as a plugin once they prove out here.

- **`context-keeper`** — owns `CONTEXT-DATA.md`, the project's state file. Invoke it at the end of a completed demand, or when asked to record state. It records only what git diffs, file reads, command output or the user's own words prove, and it marks *implemented* separately from *verified*. It caps the file at 150 lines and prunes on overflow. Its "Becos sem saída" section records abandoned approaches and why they failed — read it before retrying anything that looks previously attempted. It refuses to touch code or this file.
- **`committer`** — creates commits in Conventional Commits format. It first reads the repository's existing log and any commitlint/`.gitmessage` config and follows that convention (language, scopes, body usage, footers) over any generic default. Its main job is splitting an unrelated diff into atomic commits — the test it applies is whether reverting a single commit would leave the repository coherent. It blocks on secrets, build artifacts, conflict markers and stray debuggers, and it never pushes, force-pushes, rebases or amends published history.
- **`backend-architect`** — backend design specialist: scalability, performance, maintainability, SOLID, concurrency correctness. Stack-agnostic — it detects language, framework, datastore and deploy shape before opining. Default mode is review-and-propose over new/changed code; it writes code only when explicitly asked. Scope split with `sonar-quality`: that one owns the smell taxonomy, this one owns design — layering and dependency direction, transaction boundaries, idempotency, backpressure, N+1 and index gaps, resilience and observability. It reports a finding only when it can name the concrete damage, and it says `sem medição` rather than inventing a performance number.
- **`frontend-architect`** — frontend design specialist: load and runtime performance, codebase scalability, maintainability, SOLID applied to components, async-state correctness and accessibility. Stack-agnostic — it detects framework, rendering model (SPA/SSR/SSG/server components), bundler and state libraries first, because the same code is a defect in one model and a non-issue in another. Default mode is review-and-propose over new/changed code; it writes code only when explicitly asked. Its core rules: state lives in the smallest scope that works (local → URL → feature context → global), server data is not client state, presentation components stay pure, and dependencies point `feature` → `shared`, never back. Reports a finding only when it can name the damage (KB, re-renders, files per new variant, who gets locked out), and says `sem medição` rather than inventing a number.
- **`documenter`** — owns `docs/`. Writes and maintains plan, ADRs, rules, guides, reference, runbook, glossary and the `docs/README.md` index. Organizes by purpose of reading (explanation / guide / reference / operation), one purpose per file, every file dated and stamped with a status. Records only what code, diffs, command output or the user's words prove — an unverifiable gap becomes an explicit `A DEFINIR: <question>`, never a plausible guess. It never copies information that already lives in code or config; it links to `path:line` instead, because a copy diverges within weeks. Document bodies are written as normal prose, not compressed. It refuses to touch code, `CLAUDE.md` or `CONTEXT-DATA.md` and names the owner instead.
- **`sonar-quality`** — read-only quality audit using Sonar's criteria. Runs against the real SonarQube/SonarCloud API when the project is configured for it, and falls back to applying Sonar's taxonomy statically otherwise. Default scope is new/changed code (Clean as You Code), not the whole repository. It reports; it never fixes.

`CLAUDE.md` is instruction, `CONTEXT-DATA.md` is state. Keep them separate — an agent rewriting instructions corrupts them.

**Closing step for every demand:** once work is finished and verified, invoke `context-keeper` to record it in `CONTEXT-DATA.md` before ending the turn. Agents do not self-trigger, so this only happens if the main thread calls it. Read `CONTEXT-DATA.md` at the start of a session to learn where the project stands and which approaches were already abandoned.
