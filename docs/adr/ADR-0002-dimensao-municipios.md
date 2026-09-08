# ADR-0002 — Modelar `municipios` com chave primária natural `codigo_tce CHAR(3)`

> **Estado:** aceita
> **Data:** 2026-09-08

**Nota de manutenção, 2026-09-08 (posterior).** A [ADR-0004](ADR-0004-nextjs-unico.md) desfez o monorepo. A decisão de modelagem desta ADR não é afetada, mas dois caminhos citados abaixo mudaram de lugar: `app/packages/db/prisma/seed/municipios-tce-pb.csv` é hoje `app/prisma/seed/municipios-tce-pb.csv`, e `app/packages/db/src/seed/municipios.ts:80-85` é hoje `app/src/seed/municipios.ts:79-84`. O texto da decisão não foi alterado.

**Nota de manutenção, 2026-09-08 (anterior à ADR-0004).** O monorepo pnpm passou a viver na pasta `app/` do repositório. As citações de caminho deste documento apontavam para os caminhos daquele momento a partir da raiz do repositório: `app/docker-compose.yml`, `app/packages/db/...`. O texto da decisão não foi alterado.

## Contexto

`municipios` é a primeira tabela do banco e a dimensão de que todas as tabelas de fato dependem. O dimensionamento estimado no plano é de 60 a 100 milhões de linhas de fato no histórico completo (`docs/plano.md`, seção 4, "Dimensionamento"), cada uma precisando resolver a qual município pertence.

Três propriedades da fonte, apuradas na coleta de 2026-09-08 e registradas em [`../procedencia-municipios.md`](../procedencia-municipios.md), condicionam a modelagem:

1. O código do município no TCE-PB é um **segmento do caminho da URL** de onde o dado é baixado: `dados-por-municipio/001/despesas/despesas-2026.zip`. Ele tem sempre três dígitos com zero à esquerda.
2. Os **três últimos dígitos de `codigo_unidade_gestora` são exatamente esse código**, sem exceção em todas as unidades gestoras dos 223 municípios. `codigo_unidade_gestora` está presente em todas as linhas dos quatro datasets.
3. O **campo de nome do município dentro do CSV não é confiável**: diverge entre datasets em 3 dos 223 códigos e, no código `190`, aponta para o município errado por defeito de publicação do TCE-PB, em 22 anos de arquivos de `receitas`.

O banco de desenvolvimento roda com locale `C` e encoding UTF-8 (`app/docker-compose.yml:26`), escolha feita para que ordenação e índice não dependam da versão da libc da imagem. Consequência direta: comparação é byte a byte, então `ILIKE '%agua%'` não encontra `Água Branca`.

Dos 223 nomes, 93 (42%) contêm ao menos um diacrítico.

## Decisão

A chave primária de `municipios` é `codigo_tce CHAR(3)`, chave natural, sem identificador sintético.

O tipo é `CHAR(3)` com `CHECK (codigo_tce ~ '^[0-9]{3}$')`, não um inteiro.

A tabela tem uma coluna `nome_normalizado` — nome sem diacrítico e em caixa alta — com restrição `UNIQUE`, além de `nome`, também `UNIQUE`.

A tabela não tem nenhum índice além da chave primária e desses dois `UNIQUE`.

A tabela **não tem** coluna `codigo_ibge`.

O conteúdo é populado a partir de `app/packages/db/prisma/seed/municipios-tce-pb.csv`, versionado no repositório, e não de um download em tempo de seed.

O contrato completo da tabela está em [`../referencia/dimensao-municipios.md`](../referencia/dimensao-municipios.md).

## Alternativas consideradas

**Identificador sintético (`id serial` ou UUID) como chave primária.** Rejeitada pelo custo no caminho de ingestão. Com chave natural, a chave estrangeira de município sai por `substring` do `codigo_unidade_gestora` já presente na linha bruta, dentro do próprio `COPY`/merge em lote. Com identificador sintético, cada uma das dezenas de milhões de linhas ingeridas precisaria de uma resolução extra contra esta dimensão — ou de um passo de junção adicional no merge — para converter código em `id`. A dimensão é fechada em 223 linhas e o código não muda: nenhum dos benefícios usuais da chave sintética (chave instável, chave larga, chave com significado que pode mudar) se aplica.

**`SMALLINT` em vez de `CHAR(3)`.** Rejeitada porque o zero à esquerda é significativo: `1` não é `001` na URL da fonte. Com inteiro, a formatação `padStart(3, "0")` teria de ser repetida em todo ponto que monta URL ou compara com o dado bruto, e um único esquecimento produz requisição para um caminho inexistente — falha silenciosa de coleta, não erro de tipo. O `CHAR(3)` ainda dá um efeito colateral útil: o Postgres completa com espaço o valor curto, então `'1'` chega como `'1  '` e o `CHECK` de formato rejeita.

**Buscar por nome com `unaccent` ou `citext` em vez de coluna materializada.** Não foi adotada. `unaccent` em predicado impede uso de índice sem índice funcional, e `citext` resolve caixa mas não diacrítico. Com 223 linhas a diferença de desempenho é irrelevante, mas `nome_normalizado` tem um segundo consumidor que nenhuma das duas atende: o casamento do nome que vem nos CSVs de fato contra esta dimensão, cuja divergência observada entre datasets é justamente de acentuação.

**Criar `codigo_ibge` agora, nulo, para preencher depois.** Rejeitada. O código IBGE não aparece em nenhum dataset do bucket e o TCE-PB não publica tabela de-para — a varredura completa do bucket confirma. Coluna permanentemente nula é dívida que alguém preenche pela metade e passa a consultar como se fosse confiável. Em uma tabela de 223 linhas, um `ALTER TABLE ADD COLUMN` no dia em que houver fonte custa milissegundos.

**Baixar e derivar o CSV semente em tempo de seed, em vez de versioná-lo.** Rejeitada. Refazer o arquivo exige baixar centenas de MB e depende de o bucket do TCE-PB estar de pé, o que quebraria o setup em máquina nova e em integração contínua. São 25 KB de dado que só muda por lei estadual de criação ou renomeação de município.

**Índice de trigrama (`pg_trgm`) sobre `nome_normalizado`.** Rejeitada por ora: 223 linhas cabem em uma página e o *sequential scan* é mais barato que o índice. Se a busca do painel passar a combinar municípios com fornecedores, o índice entra na tabela de fornecedores, que é grande, não aqui.

## Consequências

**Fica mais fácil.** A chave estrangeira de município nas tabelas de fato é derivável da linha bruta sem consultar o banco, o que mantém o merge de staging para fato como uma única sentença SQL em lote. A URL da fonte é reconstruível a partir da chave primária, sem formatação intermediária. A busca por nome sem acento funciona com o locale `C` do banco, sem extensão adicional.

**Fica mais difícil.** Três `CHECK` e dois `COMMENT ON` são SQL escrito à mão dentro da migração, porque o schema declarativo do Prisma não os expressa — o mesmo problema já registrado na [ADR-0001](ADR-0001-nextjs-nestjs-prisma.md), seção "Consequências". Um banco reconstruído por `prisma db push` a partir do schema fica sem essas restrições e aceita dado que o banco real rejeita.

`nome_normalizado` é dado derivado gravado: a função de normalização (`app/packages/db/src/seed/municipios.ts:80-85`) e a coluna podem divergir se alguém escrever na tabela por outro caminho. O `CHECK` de formato (`^[A-Z ']+$`) limita o estrago — qualquer acento ou minúscula que vaze falha na escrita em vez de virar linha que a busca nunca encontra — mas não impede uma normalização errada e consistente com ela mesma.

**Passa a ser obrigatório.** A resolução de município na ingestão sai do **código** — do caminho da URL ou dos três últimos dígitos de `codigo_unidade_gestora` — e **nunca** do campo de nome dentro do CSV. Essa não é uma preferência: o defeito do código `190` faria `São José do Bonfim` receber cerca de 22 anos de receitas de `Mataraca`.

Alterar o conteúdo da dimensão passa a ser alterar um arquivo versionado e submetê-lo a revisão, não rodar um `UPDATE`. Qualquer mudança fica no histórico do git, com o registro de método em [`../procedencia-municipios.md`](../procedencia-municipios.md).
