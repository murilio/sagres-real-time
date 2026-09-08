# Orientações de desenho da ingestão

> **Estado:** vigente como *orientação*, não como decisão fechada
> **Atualizado:** 2026-09-08
> **Público:** quem for escrever a Route Handler de ingestão, o binário de ingestão ou o merge de staging

Este documento registra as orientações de desenho a seguir quando a ingestão for escrita. Ele **não é uma ADR** e não fecha nenhuma decisão: nada do que está aqui foi implementado, e em 2026-09-08 **não existe Route Handler de ingestão no código** — o que existe é o banco com a dimensão `municipios` e o scaffold do Next.js (ver [`plano.md`](plano.md), seção 2). O conteúdo veio de uma revisão de desenho feita por um agente especialista em arquitetura de backend em 2026-09-08, sobre a arquitetura registrada na [ADR-0004](adr/ADR-0004-nextjs-unico.md). Quando alguma destas orientações for de fato adotada e implementada, ela deve virar ADR própria; enquanto isso, é orientação.

O documento cobre três assuntos: onde a ingestão executa, como duas execuções são impedidas de se atropelar, e como o endpoint de gatilho é protegido. Ele **não** cobre o layout dos CSVs (ver [`referencia/layout-csv-sagres.md`](referencia/layout-csv-sagres.md)), o modelo de dados nem o motor de regras (ver [`plano.md`](plano.md), seções 4 e 5).

Uma pendência atravessa tudo: **a plataforma de deploy segue `A DEFINIR`**. Perguntado em 2026-09-08, o usuário respondeu explicitamente que ainda não está decidido e que deve permanecer em aberto na documentação. Por isso a primeira seção tem dois ramos, e as duas últimas valem em qualquer ramo.

## 1. Onde a ingestão executa — depende da plataforma

### Ramo A — se o deploy for na Vercel

A ingestão **não roda dentro da função serverless**. Três motivos independentes, cada um suficiente:

| Obstáculo | Por quê |
|---|---|
| Limite de duração da função | a execução da ingestão excede o tempo máximo da função |
| Disco efêmero | o `/tmp` da função não comporta um ZIP de aproximadamente 135 MB somado ao CSV descompactado |
| Pool de conexões por instância | cada instância abre o seu próprio pool, e a soma estoura o `max_connections` do Postgres |

O ajuste mínimo nesse ramo, sem introduzir fila: o painel fica na Vercel e a ingestão roda em cron de máquina própria (VPS com *systemd timer*, por exemplo), executando um binário Node standalone — algo como `node src/bin/ingest.ts` — sem broker de mensagens.

### Ramo B — se o deploy for self-hosted (`next start` em VPS)

Aceitável, sob quatro condições:

1. **A ingestão roda fora do processo do Next.js.** O cron chama o binário de linha de comando diretamente, não por HTTP. O motivo é concreto: o parse de CSV e a normalização de números e datas em formato pt-BR são trabalho de CPU síncrono, e num processo Next.js único isso bloqueia o *event loop* que atende o painel. A Route Handler existe apenas como **gatilho fino** — registra a execução em `ingest_runs` e responde `202` — e nunca como caminho de execução do trabalho pesado.
2. **Toda Route Handler de ingestão ou de gatilho declara o runtime e desliga o cache estático**, com `export const runtime = "nodejs"` e `export const dynamic = "force-dynamic"`.
3. **Streaming obrigatório, do socket até o `COPY`.** A cadeia é `fetch` → stream de descompactação do ZIP → parser de CSV RFC 4180 em stream → transform de normalização → `COPY FROM STDIN`, ligada por `stream.pipeline`. Em nenhum ponto o arquivo inteiro é bufferizado em memória ou em disco.
4. **Sanitizar os bytes `0x00` no transform, antes do `COPY`.** Não é hipótese: o arquivo `dados-por-municipio/116/despesas/despesas-2025.csv` contém bytes NUL, e o `COPY` do Postgres os rejeita — ver [`referencia/layout-csv-sagres.md`](referencia/layout-csv-sagres.md), seção "Armadilhas de parsing observadas no conteúdo", item 3.

### Vale nos dois ramos

- **`HEAD` antes de qualquer download.** Comparar `ETag` e `Last-Modified` contra a tabela de versões de arquivo é a primeira coisa que o código faz, não uma otimização acrescentada depois.
- **A unidade de trabalho é `(dataset, ano)`**, com commit por unidade. Os quatro arquivos consolidados nunca formam uma transação única.
- **O backfill histórico é um entrypoint separado** do cron diário, executado em lote por ano e retomável.

## 2. Exclusão mútua e idempotência — independe da plataforma

Esta seção é a mais madura das três: nada nela depende de onde o código roda.

### Exclusão mútua por advisory lock do Postgres

Usar `pg_try_advisory_lock`, a variante **de sessão**, não a transacional `pg_try_advisory_xact_lock` — a execução da ingestão tem múltiplos commits, e um lock transacional cairia no primeiro deles. O lock fica preso a uma conexão dedicada, retirada explicitamente do pool com `pool.connect()`; nunca por uma query solta, que o pool pode atender com uma conexão reciclável e devolver depois, soltando o lock sem aviso.

Se o lock já estiver tomado, a rota ou o processo responde `409`, e o cron não trata isso como falha.

O motivo de escolher advisory lock em vez de uma coluna booleana de controle na tabela: se o processo morrer por OOM ou `kill`, o Postgres libera o lock sozinho quando a conexão cai, enquanto a coluna ficaria presa em "rodando" para sempre.

### Chave de idempotência

A chave é o **`ETag` da própria fonte HTTP**, não uma chave inventada pela aplicação. Restrição de unicidade em `(dataset, ano, etag)`, aplicada apenas às execuções com `status = 'sucesso'` em `ingest_runs`. Uma segunda chamada com o mesmo `ETag` encontra a execução bem-sucedida e não repete o trabalho.

### Por que o lock protege a tabela de staging

Com um único lock global, uma tabela de staging compartilhada é segura. Sem o lock, duas execuções concorrentes sobre a mesma staging causam **perda de dado real**: um `TRUNCATE` no meio do `COPY` da outra execução derruba linhas da segunda, e o merge seguinte interpreta a ausência dessas linhas como remoção em massa. O resultado é um indício falso de "registro removido" disparado contra um município que não teve nada removido.

### Cláusula obrigatória no merge

O `INSERT ... ON CONFLICT DO UPDATE` do merge precisa da cláusula `WHERE tabela.row_hash IS DISTINCT FROM excluded.row_hash`.

Sem ela, reprocessar o mesmo arquivo sem nenhuma mudança real grava uma linha nova em `empenho_versoes` e incrementa a versão à toa. O dano não é desperdício de espaço: é a regra de detecção de "empenho alterado retroativamente" — o diferencial declarado do produto — disparando um indício falso a partir de uma reexecução do próprio pipeline, ou seja, uma acusação inventada contra um município. **Tratar como requisito de corretude do merge, não como otimização.**

## 3. Proteção do endpoint de gatilho — independe da plataforma

- **Segredo em cabeçalho HTTP** (`Authorization: Bearer <token>`), nunca em query string: query string vaza em log de acesso, em cabeçalho `Referer` e em proxy.
- **Comparação em tempo constante.** Calcular o hash SHA-256 dos dois lados e aplicar `crypto.timingSafeEqual` sobre os *hashes*, não sobre os valores crus. Comparar strings cruas com `===` vaza o prefixo do segredo por tempo de resposta, e `timingSafeEqual` aplicado direto a valores de tamanhos diferentes lança exceção.
- **Falha fechada.** Se a variável de ambiente do segredo estiver ausente, a rota responde erro de servidor e não deixa passar. O antipadrão a evitar é checar o segredo apenas quando ele existe (`if (secret && header !== secret)`), que deixa o endpoint público justamente quando a variável falta.
- **Se o alvo for Vercel Cron**, ele já envia `Authorization: Bearer $CRON_SECRET` sozinho quando a variável de ambiente `CRON_SECRET` existe. Nesse caso, usar exatamente esse nome de variável e aceitar `GET`, que é o método do Vercel Cron. Para cron próprio, usar `POST`.
- **Resposta de rejeição sem corpo descritivo.** Registrar a tentativa falha (IP e identificador de correlação) sem nunca logar o segredo nem qualquer prefixo dele.
- **`Cache-Control: no-store` na resposta**: uma rota de gatilho cacheada é uma rota que não executa.

## Pendências

- **A DEFINIR: a plataforma de deploy.** Enquanto ela não for decidida, a seção 1 permanece com dois ramos e nenhum deles é o escolhido. Resposta explícita do usuário em 2026-09-08: ainda não decidido, deixar em aberto. As seções 2 e 3 não dependem desta decisão e podem ser implementadas como estão.
- As tabelas `ingest_runs` e a de versões de arquivo citadas aqui **ainda não existem no schema** (`app/prisma/schema.prisma` tem apenas `municipios`). Nomes de coluna e restrições viram contrato quando a migração for escrita.

## Nota relacionada — teto do pool de conexões

Corrigido no código em 2026-09-08, fora do escopo da ingestão mas do mesmo assunto: o parâmetro `connection_limit` na query string da `DATABASE_URL` era resquício do engine nativo do Prisma, removido na versão 7, e o driver `pg` não o lê — ou seja, não limitava nada. Foi substituído pela variável própria `DATABASE_POOL_MAX`, lida em `app/src/db.ts` e passada como `max` ao `pg.Pool`. `app/.env` e `app/.env.example` já refletem isso.
