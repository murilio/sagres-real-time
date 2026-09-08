# Referência — dimensão `municipios`

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem for consultar, referenciar por chave estrangeira ou repopular a tabela `municipios`

Contrato da primeira tabela do banco: colunas, restrições, como é populada e o que é garantido sobre o conteúdo. As razões de cada escolha estão em [`../adr/ADR-0002-dimensao-municipios.md`](../adr/ADR-0002-dimensao-municipios.md); a origem do dado está em [`../procedencia-municipios.md`](../procedencia-municipios.md).

A definição autoritativa é o código, não este documento: o model está em `app/prisma/schema.prisma:41-96` e o DDL em `app/prisma/migrations/20260908122955_init_municipios/migration.sql`. Todos os caminhos de código citados aqui partem da raiz do repositório, onde o app Next.js vive em `app/` — ver [`../adr/ADR-0004-nextjs-unico.md`](../adr/ADR-0004-nextjs-unico.md).

## Colunas

| Coluna | Tipo | Campo no Prisma | Nota |
|---|---|---|---|
| `codigo_tce` | `CHAR(3)` | `codigoTce` | chave primária; 3 dígitos com zero à esquerda, `001`–`223` |
| `nome` | `VARCHAR(120)` | `nome` | nome como aparece nos datasets, em NFC, acentuação intacta; `UNIQUE` |
| `nome_normalizado` | `VARCHAR(120)` | `nomeNormalizado` | sem diacrítico, caixa alta; `UNIQUE` |
| `criado_em` | `TIMESTAMPTZ(3)` | `criadoEm` | default `CURRENT_TIMESTAMP`; não muda em recarga |
| `atualizado_em` | `TIMESTAMPTZ(3)` | `atualizadoEm` | só avança quando `nome` ou `nome_normalizado` mudam de fato |

## Restrições

| Nome | Tipo | Definição |
|---|---|---|
| `municipios_pkey` | PRIMARY KEY | `(codigo_tce)` |
| `municipios_nome_key` | UNIQUE | `(nome)` |
| `municipios_nome_normalizado_key` | UNIQUE | `(nome_normalizado)` |
| `municipios_codigo_tce_formato` | CHECK | `codigo_tce ~ '^[0-9]{3}$'` |
| `municipios_nome_limpo` | CHECK | `btrim(nome) <> '' AND nome = btrim(nome)` |
| `municipios_nome_normalizado_formato` | CHECK | `nome_normalizado ~ '^[A-Z '']+$'` |

Os três `CHECK` e os dois `COMMENT ON` são SQL escrito à mão dentro da migração; o schema declarativo do Prisma não os expressa. Reconstruir o banco a partir do `schema.prisma` — por `prisma db push`, por exemplo — produz a tabela **sem** essas restrições.

**Não há nenhum índice além da chave primária e dos dois `UNIQUE`.** A tabela tem 223 linhas e cabe em uma página; um índice adicional só custaria escrita.

O `CHECK` de formato depende de um detalhe do `CHAR(3)`: o Postgres completa com espaço à direita o valor mais curto, então `'1'` chega como `'1  '` e o regex `^[0-9]{3}$` rejeita. Perder o zero à esquerda é exatamente o defeito que se quer barrar, porque o código é segmento de caminho da URL da fonte.

## Como popular

O dado vem de `app/prisma/seed/municipios-tce-pb.csv`, versionado no repositório: 223 linhas mais cabeçalho, separador `;`, UTF-8 **sem** BOM, forma Unicode NFC, ordenado por `codigo_tce`, 25.107 bytes. O cabeçalho é `codigo_tce;nome_municipio;fonte_url` e a terceira coluna aponta, para cada linha, o arquivo do TCE-PB de onde o nome foi lido.

O seed é `app/src/seed/municipios.ts`. Ele roda de duas formas, sempre com `app/` como diretório de trabalho:

```bash
pnpm seed   # tsx src/seed/municipios.ts — executa o fonte, sem passo de build
```

ou automaticamente durante `prisma migrate reset`, via `migrations.seed` em `app/prisma.config.ts:31`.

O seed valida antes de tocar o banco e aborta em qualquer divergência: cabeçalho diferente do esperado, número de linhas diferente de 223, código fora de `^[0-9]{3}$`, nome vazio ou com espaço nas bordas, nome fora de NFC, código ausente na faixa `001`–`223`, ou valor repetido em qualquer das três colunas únicas. A escrita é uma única sentença `INSERT ... ON CONFLICT DO UPDATE` com `WHERE ... IS DISTINCT FROM`, dentro de transação que também confere a contagem final e reverte se ela não for 223.

## Garantias sobre o conteúdo

Verificado no banco em 2026-09-08, contra o contêiner `sagres-postgres`. A contagem de 223 foi conferida de novo, no mesmo dia, depois de o contêiner ser recriado sob o nome de projeto Compose fixado — ver [`../guia-ambiente-local.md`](../guia-ambiente-local.md), seção 3:

- **223 linhas.**
- **Códigos `001`–`223` sem buraco**, verificado por `LEFT JOIN` contra `generate_series(1,223)` e não por contagem simples — 223 linhas com um código repetido e outro faltando passariam por uma contagem.
- **223 nomes distintos** e 223 nomes normalizados distintos.
- Migração `20260908122955_init_municipios` aplicada com sucesso, registrada em `_prisma_migrations`.

Exemplos de linha, lidos do banco:

| `codigo_tce` | `nome` | `nome_normalizado` |
|---|---|---|
| `001` | `Água Branca` | `AGUA BRANCA` |
| `116` | `Mataraca` | `MATARACA` |
| `130` | `Olho d'Água` | `OLHO D'AGUA` |
| `190` | `São José do Bonfim` | `SAO JOSE DO BONFIM` |

## Divergência encontrada na verificação

O estado atual do banco **não é** o de uma carga única limpa. As colunas de tempo mostram duas escritas distintas:

- 222 linhas com `criado_em = 2026-09-08 12:32:48.916+00`;
- 1 linha, o código `001`, com `criado_em = 2026-09-08 12:33:37.892+00`;
- exatamente 1 linha, o código `223`, com `atualizado_em` posterior ao seu `criado_em`, carimbada em `2026-09-08 12:33:37.892+00`.

Ou seja: houve pelo menos duas execuções de escrita, e a segunda não foi um no-op. Isso é compatível com um teste deliberado do caminho de correção — apagar uma linha e alterar outra, para conferir que a reexecução do seed reinsere e corrige — mas **não foi possível confirmar a causa a partir do banco**.

O conteúdo final está correto: 223 linhas, códigos contíguos, nomes conferindo com o CSV semente. O que não está verificado é a afirmação de idempotência na forma "segunda execução: 0 inseridos, 0 atualizados".

**A DEFINIR:** o que aconteceu entre `12:32:48Z` e `12:33:37Z` no banco local? A causa daquelas duas escritas continua sem explicação.

A afirmação de idempotência, porém, deixou de depender só da leitura do código (`app/src/seed/municipios.ts:239-251`): em 2026-09-08, depois da reorganização para app único, `pnpm seed` foi executado contra este mesmo banco já populado e reportou `223 linhas lidas` e `0 inseridos, 0 atualizados, 223 na tabela`. É uma observação sobre um banco já carregado, não sobre um banco limpo seguido de duas execuções seguidas. Um teste automatizado que rode o seed duas vezes contra um banco limpo e afirme `inseridos = 0` e `atualizados = 0` na segunda execução resolveria isso de forma permanente — não existe teste automatizado no projeto.
