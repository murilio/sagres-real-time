# Referência — layout dos CSVs do SAGRES/TCE-PB

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem for escrever ou revisar o parser de ingestão e o contrato de layout

Este documento fixa o cabeçalho exato de cada um dos quatro datasets publicados pelo TCE-PB, por faixa de anos, e as armadilhas de parsing observadas no conteúdo desses arquivos. Ele existe porque o layout **não é estável entre anos dentro do mesmo dataset**, e um parser escrito contra o cabeçalho do ano corrente parseia colunas trocadas ao processar o histórico.

Este documento não descreve o significado de negócio das colunas, nem o modelo de dados de destino — para isso veja [`../plano.md`](../plano.md), seções 1 e 4.

O parser e o contrato de layout ainda não existem no repositório, e **A DEFINIR:** onde eles vão morar dentro do app único — o pacote `packages/ingest-core` que este documento citava foi eliminado junto com o monorepo ([`../adr/ADR-0004-nextjs-unico.md`](../adr/ADR-0004-nextjs-unico.md)).

## Como estes dados foram verificados

Verificado em 2026-09-08 baixando os primeiros 16 KB de cada ZIP consolidado com requisição HTTP `Range`, inflando o stream `deflate` bruto e lendo a primeira linha do CSV. Foram lidos os **74 arquivos consolidados** existentes: `despesas` e `receitas` de 2003 a 2026, `servidores` de 2013 a 2026, `licitacoes` de 2015 a 2026. Nenhuma requisição falhou.

O mesmo cabeçalho foi conferido também nos arquivos **por município** de `despesas-2026` (códigos `001` e `223`) e bateu byte a byte com o consolidado do mesmo ano.

Para repetir a verificação de um arquivo isolado, sem baixar o ZIP inteiro:

```bash
curl -s -r 0-16383 \
  "https://download.tce.pb.gov.br/dados-abertos/dados-consolidados/despesas/despesas-2026.zip" \
  -o /tmp/parcial.zip
# o ZIP truncado não abre com unzip; é preciso inflar o stream bruto
# (pular o local file header e chamar zlib com wbits = -15)
```

## Regra geral

| Propriedade | Valor |
|---|---|
| Container | ZIP com **exatamente um** membro, nomeado `{dataset}-{ano}.csv` |
| Separador | `;` |
| Encoding | UTF-8 **com BOM** (`EF BB BF`) em 100% dos arquivos verificados |
| Aspas | `"`, com campos multi-linha — o arquivo é RFC 4180, não é orientado a linha |
| Datas | `dd/MM/yyyy` |
| Números | pt-BR (`25.499,48`), com os decimais omitidos quando são zero (`8.748`, `485`) |

## Versões de layout por dataset

Cada linha abaixo é uma versão de cabeçalho distinta. Um contrato de layout que assuma "um cabeçalho por dataset" está errado: o contrato precisa ser por **par (dataset, faixa de anos)**.

| Dataset | Versões de layout | Faixa de anos | Colunas | Primeira coluna |
|---|---|---|---|---|
| `despesas` | A | 2003–2019 | 40 | `municipio` |
| `despesas` | B | 2020–2026 | 40 | `municipio` |
| `receitas` | única | 2003–2026 | 13 | `municipio` |
| `servidores` | A | 2013–2019 | 11 | `municipio` |
| `servidores` | B | 2020–2026 | 11 | `nome_municipio` |
| `licitacoes` | única | 2015–2026 | 13 | `nome_municipio` |

Observação que muda o desenho da validação: em `despesas`, as duas versões têm **o mesmo número de colunas (40)** e diferem apenas em **nomes** de colunas intermediárias. Validar apenas a contagem de campos aceita o arquivo antigo em silêncio e grava o valor certo com o rótulo errado. A validação precisa comparar a lista de nomes inteira.

### `despesas` — o que muda entre a versão A e a B

As duas versões concordam nas 29 posições não listadas. A troca é de nomenclatura, na mesma ordem posicional:

| Posição | 2003–2019 (A) | 2020–2026 (B) |
|---|---|---|
| 15 | `descricao_funcao` | `funcao` |
| 17 | `descricao_subfuncao` | `subfuncao` |
| 19 | `descricao_programa` | `programa` |
| 21 | `descricao_acao` | `acao` |
| 23 | `descricao_categoria_economica` | `categoria_economica` |
| 24 | `codigo_natureza_despesa` | `codigo_natureza` |
| 25 | `descricao_natureza_despesa` | `grupo_natureza_despesa` |
| 26 | `codigo_modalidade` | `codigo_modalidade_aplicacao` |
| 27 | `descricao_modalidade` | `modalidade_aplicacao` |
| 29 | `descricao_elemento_despesa` | `elemento_despesa` |
| 31 | `descricao_subelemento` | `codigo_subelemento_exibicao` |

**A DEFINIR:** na posição 31 o nome muda de `descricao_subelemento` para `codigo_subelemento_exibicao` — de descrição para código. As demais trocas são cosméticas; esta sugere mudança de conteúdo, não só de rótulo. É preciso comparar os valores de um mesmo empenho entre `despesas-2019` e `despesas-2020` antes de tratar as duas colunas como a mesma no modelo de destino.

### Cabeçalhos completos

`despesas`, versão B (2020–2026), 40 colunas:

```
municipio; codigo_unidade_gestora; descricao_unidade_gestora; numero_empenho;
data_empenho; mes; cpf_cnpj; nome_credor; valor_empenhado; valor_liquidado; valor_pago;
codigo_unidade_orcamentaria; descricao_unidade_orcamentaria; codigo_funcao; funcao;
codigo_subfuncao; subfuncao; codigo_programa; programa; codigo_acao; acao;
codigo_categoria_economica; categoria_economica; codigo_natureza; grupo_natureza_despesa;
codigo_modalidade_aplicacao; modalidade_aplicacao; codigo_elemento_despesa; elemento_despesa;
codigo_subelemento; codigo_subelemento_exibicao; numero_licitacao; modalidade_licitacao;
numero_obra; historico; codigo_fonte_recurso; descricao_fonte_recurso; ano_fonte;
co; descricao_co
```

`receitas`, versão única (2003–2026), 13 colunas:

```
municipio; codigo_unidade_gestora; descricao_unidade_gestora; mes_ano; ano;
codigo_receita; descricao_receita; tipo_atualizacao_receita; valor;
codigo_fonte_recurso; descricao_fonte_recurso; co; descricao_co
```

`servidores`, versão B (2020–2026), 11 colunas:

```
nome_municipio; codigo_unidade_gestora; descricao_unidade_gestora; cpf_cnpj;
nome_servidor; tipo_cargo; descricao_cargo; valor_vantagem; data_admissao;
matricula; ano_mes
```

`licitacoes`, versão única (2015–2026), 13 colunas:

```
nome_municipio; codigo_unidade_gestora; descricao_unidade_gestora; numero_licitacao;
numero_protocolo_tce; ano_licitacao; modalidade; objeto_licitacao; data_homologacao;
nome_proponente; cpf_cnpj_proponente; valor_ofertado; situacao_proposta
```

`despesas` versão A e `servidores` versão A diferem das versões B apenas nos pontos listados nas tabelas acima.

## Armadilhas de parsing observadas no conteúdo

Todas foram encontradas em arquivos reais durante a coleta de 2026-09-08 descrita em [`../procedencia-municipios.md`](../procedencia-municipios.md). São propriedades da fonte, não hipóteses.

1. **BOM UTF-8 em todos os arquivos.** Sem removê-lo, o nome da primeira coluna é lido como `﻿municipio` e a busca pelo nome da coluna falha. O contrato de layout tem de comparar o cabeçalho **depois** de descartar os três bytes.

2. **Campos entre aspas com quebra de linha embutida.** O campo `descricao_receita` traz texto legal multi-linha. Dividir o arquivo por `\n` corrompe registros: na coleta, isso produziu falsos nomes de município — como `transferências da União"` — em 6 dos 223 códigos. **O parser de ingestão não pode ser orientado a linha; precisa ser um leitor RFC 4180 sobre o stream inteiro.**

3. **Byte NUL dentro do CSV.** O arquivo `dados-por-municipio/116/despesas/despesas-2025.csv` contém 13 bytes `0x00`. Eles abortam leitores que rejeitam NUL — o módulo `csv` da biblioteca padrão do Python, por exemplo, levanta `_csv.Error: line contains NUL`. O `COPY` do Postgres também rejeita NUL em coluna `text`. A ingestão precisa remover esses bytes antes de escrever no staging.

4. **O campo de nome do município não é confiável como chave.** Ele diverge entre datasets para 3 dos 223 códigos, e em um dos casos aponta para o município errado. A dimensão município deve ser resolvida pelo **código do caminho da URL** ou pelos três últimos dígitos de `codigo_unidade_gestora`, nunca pelo campo de nome do CSV. Detalhes e evidência em [`../procedencia-municipios.md`](../procedencia-municipios.md).

5. **Arquivo de ano fechado carrega o nome atual do município,** não o nome vigente à época da remessa — comportamento consistente com o reprocessamento em bloco de 05–06/02/2026. Arquivo histórico do TCE não é evidência de grafia de época.

6. **`codigo_unidade_gestora` tem sempre 6 dígitos** e os 3 últimos são exatamente o código do município do caminho, sem exceção em todas as unidades gestoras dos 223 municípios (verificado em `receitas-2026`). É essa propriedade que permite resolver a chave estrangeira de município por substring, sem consultar a dimensão linha a linha — ver [`../adr/ADR-0002-dimensao-municipios.md`](../adr/ADR-0002-dimensao-municipios.md).

7. **Não existe código IBGE em nenhum dataset.** A varredura completa do bucket não encontrou tabela de referência de municípios publicada pelo TCE-PB.
