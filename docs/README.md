# Documentação — Monitor SAGRES TCE-PB

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** qualquer pessoa que vá trabalhar no projeto

Índice dos documentos em `docs/`, organizado por propósito de leitura. Cada documento responde a um tipo de pergunta e apenas um. Este arquivo não contém conteúdo próprio além do índice — para instruções operacionais ao agente de código veja `CLAUDE.md`, e para o estado corrente do projeto veja `CONTEXT-DATA.md`, ambos na raiz do repositório.

## Explicação — por que é assim

| Documento | O que responde | Para quem |
|---|---|---|
| [`plano.md`](plano.md) | escopo, fonte de dados, arquitetura, modelo de dados, motor de regras, roadmap e riscos | quem precisa entender o projeto inteiro antes de mexer em qualquer parte |
| [`adr/ADR-0001-nextjs-nestjs-prisma.md`](adr/ADR-0001-nextjs-nestjs-prisma.md) | por que Next.js, NestJS e Prisma, e o que essa escolha custa no caminho de ingestão | quem for escrever schema, migração ou código de acesso a dados |

## Guia — como faço X

Nenhum documento ainda. O projeto está em fase de pré-implementação e não há tarefa reproduzível a documentar.

## Referência — qual é o contrato exato

Nenhum documento ainda. Os esquemas dos CSVs da fonte estão descritos em `plano.md`, seção "Esquemas reais dos CSVs"; quando existir contrato de layout versionado em código, a referência aponta para lá.

## Operação — o que fazer quando quebra

Nenhum documento ainda. Passa a existir quando houver ingestão rodando em ambiente real.

## Convenções

- Todo documento abre com estado, data de atualização em formato `AAAA-MM-DD` e público-alvo.
- Uma decisão de arquitetura por arquivo em `docs/adr/`, numerada em sequência. ADR aceita não é reescrita: decisão nova que muda uma antiga vira ADR nova que a substitui.
- Informação que já vive no código, no schema ou na configuração não é copiada para cá; o documento aponta para o arquivo e a linha.
- Lacuna que não pode ser verificada vira `A DEFINIR:` com a pergunta exata, nunca um palpite plausível.
