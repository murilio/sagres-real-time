# Documentação — Monitor SAGRES TCE-PB

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** qualquer pessoa que vá trabalhar no projeto

Índice dos documentos em `docs/`, organizado por propósito de leitura. Cada documento responde a um tipo de pergunta e apenas um. Este arquivo não contém conteúdo próprio além do índice — para instruções operacionais ao agente de código veja `CLAUDE.md`, e para o estado corrente do projeto veja `CONTEXT-DATA.md`, ambos na raiz do repositório. O código vive na pasta `app/`, que contém um único aplicativo Next.js — não há mais monorepo pnpm. Todo caminho de código citado nos documentos parte de `app/`, e todo comando `pnpm` ou `docker compose` roda com `app/` como diretório de trabalho, sem `--filter` — ver [`guia-ambiente-local.md`](guia-ambiente-local.md), seção "Diretório de trabalho", e [`adr/ADR-0004-nextjs-unico.md`](adr/ADR-0004-nextjs-unico.md).

## Explicação — por que é assim

| Documento | O que responde | Para quem |
|---|---|---|
| [`plano.md`](plano.md) | escopo, fonte de dados, arquitetura, modelo de dados, motor de regras, roadmap e riscos | quem precisa entender o projeto inteiro antes de mexer em qualquer parte |
| [`procedencia-municipios.md`](procedencia-municipios.md) | de onde vieram os 223 pares código → nome, com que método, e quais defeitos a fonte tem | quem for revisar ou refazer o CSV semente, e quem precise julgar o quanto confiar nele |
| [`adr/ADR-0001-nextjs-nestjs-prisma.md`](adr/ADR-0001-nextjs-nestjs-prisma.md) | por que Prisma, e o que essa escolha custa no caminho de ingestão. **Parcialmente superada pela ADR-0004:** a arquitetura de serviços que ela decide não vale mais | quem for escrever schema, migração ou código de acesso a dados |
| [`adr/ADR-0002-dimensao-municipios.md`](adr/ADR-0002-dimensao-municipios.md) | por que a chave primária de `municipios` é natural, por que `CHAR(3)`, por que não há código IBGE | quem for criar tabela de fato com chave estrangeira de município |
| [`adr/ADR-0003-prisma-7-driver-adapter.md`](adr/ADR-0003-prisma-7-driver-adapter.md) | quais versões estão fixadas e por que a conexão passa por driver adapter. **Parcialmente superada pela ADR-0004:** a organização em pacotes de workspace não vale mais | quem for consumir o client de `app/src/db.ts` ou mexer no build |
| [`adr/ADR-0004-nextjs-unico.md`](adr/ADR-0004-nextjs-unico.md) | por que o projeto virou um único app Next.js, o que isso substitui, e o que ficou em aberto no desenho da ingestão | quem for criar Route Handler, decidir onde novo código mora ou pensar deploy |
| [`desenho-ingestao.md`](desenho-ingestao.md) | orientações de desenho para a ingestão — onde executa, exclusão mútua e idempotência, proteção do endpoint de gatilho. **Orientação, não decisão fechada:** nada disso foi implementado | quem for escrever a ingestão, o gatilho HTTP ou o merge de staging |

## Guia — como faço X

| Documento | O que responde | Para quem |
|---|---|---|
| [`guia-ambiente-local.md`](guia-ambiente-local.md) | como subir o Postgres local, aplicar as migrações e popular a dimensão `municipios` | quem clonou o repositório ou precisa recriar o banco |

## Referência — qual é o contrato exato

| Documento | O que responde | Para quem |
|---|---|---|
| [`referencia/layout-csv-sagres.md`](referencia/layout-csv-sagres.md) | cabeçalho exato de cada dataset por faixa de anos, e as armadilhas de parsing do conteúdo | quem for escrever o parser de ingestão e o contrato de layout |
| [`referencia/dimensao-municipios.md`](referencia/dimensao-municipios.md) | colunas, restrições e garantias de conteúdo da tabela `municipios`, e como repopulá-la | quem for consultar ou referenciar a dimensão por chave estrangeira |

## Operação — o que fazer quando quebra

Nenhum documento ainda. Passa a existir quando houver ingestão rodando em ambiente real.

## Convenções

- Todo documento abre com estado, data de atualização em formato `AAAA-MM-DD` e público-alvo.
- Uma decisão de arquitetura por arquivo em `docs/adr/`, numerada em sequência. ADR aceita não é reescrita: decisão nova que muda uma antiga vira ADR nova que a substitui. Anotar uma pendência como resolvida, apontando para onde ela foi resolvida, não conta como reescrita.
- Informação que já vive no código, no schema ou na configuração não é copiada para cá; o documento aponta para o arquivo e a linha.
- Referência a `docs/` aponta seção, não número de linha: documento em manutenção desloca linhas e o ponteiro apodrece em silêncio.
- Lacuna que não pode ser verificada vira `A DEFINIR:` com a pergunta exata, nunca um palpite plausível.
