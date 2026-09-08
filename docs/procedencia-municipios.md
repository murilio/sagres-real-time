# Procedência do mapeamento código TCE-PB → município

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem for revisar, corrigir ou refazer o arquivo `app/prisma/seed/municipios-tce-pb.csv`, e quem precisar julgar o quanto confiar nele

Este documento registra de onde vieram os 223 pares código → nome que populam a dimensão `municipios`, qual método foi usado, quais divergências a fonte apresentou e como cada uma foi resolvida. Ele existe porque o TCE-PB **não publica** tabela de referência de municípios: o arquivo foi derivado dos próprios datasets, e um dado derivado sem registro de método é indistinguível de um dado inventado.

Este documento não descreve o contrato da tabela no banco — para isso veja [`referencia/dimensao-municipios.md`](referencia/dimensao-municipios.md) — nem justifica as escolhas de modelagem, que estão em [`adr/ADR-0002-dimensao-municipios.md`](adr/ADR-0002-dimensao-municipios.md).

## Escopo e data

Coleta executada em **2026-09-08**, exclusivamente contra `https://download.tce.pb.gov.br/`. Nenhuma outra fonte foi consultada: nenhum serviço externo, nenhuma lista digitada de memória.

## Método

**Passo 1 — conjunto de códigos.** Listagem paginada do bucket pela API S3 v2, seguindo `NextContinuationToken` até `IsTruncated=false`, sobre o prefixo `dados-por-municipio/`:

```bash
curl -s "https://download.tce.pb.gov.br/dados-abertos/?list-type=2&max-keys=1000&prefix=dados-por-municipio/"
```

Resultado: **17 páginas, 16.502 chaves**, todas no padrão `dados-por-municipio/{codigo}/{dataset}/{dataset}-{ano}.zip`, sem nenhuma chave fora do padrão. Os códigos distintos são **223**, no intervalo `001`–`223`, **contíguos**, sempre com 3 dígitos e zero à esquerda.

**Passo 2 — nomes.** Para cada código, o nome foi lido do campo de município dentro do CSV. Para não baixar 125 MB por dataset, foi usada requisição HTTP `Range` sobre os primeiros 32 KB do ZIP com inflate do stream `deflate` bruto — 32 KB comprimidos rendem cerca de 363 KB de CSV, muito além do necessário para o cabeçalho e milhares de linhas. Custo por dataset completo: cerca de 7 MB em vez de 50 a 125 MB.

**Passo 3 — validação cruzada.** Em vez de uma amostra, foram lidos **os 223 códigos em 9 fontes independentes**, cobrindo os 4 datasets e 3 anos: `despesas-2025`, `despesas-2026`, `licitacoes-2024`, `licitacoes-2025`, `licitacoes-2026`, `receitas-2025`, `receitas-2026`, `servidores-2025`, `servidores-2026`. Cada fonte devolveu 223 de 223 códigos, e cada dataset apresentou um único cabeçalho nos 223 municípios — nenhuma coluna deslocada.

**Passo 4 — resolução.** Voto majoritário entre as 9 fontes. **Não houve empate em nenhum dos 223 códigos.** O dataset `despesas-2026` concorda com o nome resolvido em 223 de 223, e por isso é a `fonte_url` registrada em todas as linhas do CSV semente: uma fonte única, recente e auditável.

Zero falhas de HTTP, zero ZIP corrompido, zero código sem nome.

## Resultado

220 dos 223 códigos têm acordo unânime entre as 9 fontes. Três divergem.

### Divergência 1 — código `001`, acentuação (5 contra 4)

`Água Branca` aparece em `despesas-2026`, `licitacoes-2026`, `receitas-2025`, `receitas-2026` e `servidores-2026`. `Agua Branca`, sem acento, aparece em `despesas-2025`, `licitacoes-2024`, `licitacoes-2025` e `servidores-2025`.

A divisão não é por dataset, é por ano de remessa: as quatro fontes de 2026 são unânimes com acento. **Adotado `Água Branca`.**

### Divergência 2 — código `130`, apóstrofo (7 contra 2)

`Olho d'Água` com apóstrofo `U+0027` aparece em sete fontes. `Olho d´Água` com acento agudo solto `U+00B4` aparece nas duas fontes de `receitas`, e também em `receitas-2003` — ou seja, é artefato exclusivo do dataset `receitas`, em todos os anos. **Adotado `Olho d'Água`,** com `U+0027`.

### Divergência 3 — código `190`, município errado na fonte (8 contra 1)

Esta não é diferença de grafia. Oito fontes dizem `São José do Bonfim` para o código `190`; `receitas-2025` diz `Mataraca`. **Mataraca é o código `116`**, confirmado em todas as fontes.

Evidência documental do defeito na origem: os arquivos `dados-por-municipio/190/receitas/receitas-2003.zip` e `dados-por-municipio/116/receitas/receitas-2003.zip` são **byte a byte idênticos**, ambos com md5 `a0b39923f2b4f0fd965d12a6552dd29f`. O TCE-PB publicou o arquivo de receitas do município `116` dentro da pasta do `190`.

O defeito atinge o dataset `receitas` de 2003 a 2025 e **foi corrigido na origem a partir de `receitas-2026`** — `190/receitas/receitas-2026.zip` já traz `São José do Bonfim`. Os outros três datasets nunca foram afetados. **Adotado `São José do Bonfim`.**

> **Consequência direta para a ingestão.** Se a dimensão de município for resolvida pelo campo de nome dentro do CSV, e não pelo código do caminho, `São José do Bonfim` recebe cerca de 22 anos de receitas de `Mataraca`. Resolver município pelo código do caminho ou pelos três últimos dígitos de `codigo_unidade_gestora` não é preferência de estilo: é o que impede esse erro de entrar no banco.

## Verificações estruturais independentes

**`codigo_unidade_gestora` confirma o código do caminho — 223 de 223.** Lidas todas as unidades gestoras dos 223 arquivos `receitas-2026`: toda UG tem 6 dígitos e seus 3 últimos dígitos são exatamente o código do município do diretório, sem exceção. Todo município tem uma UG `201<codigo>`, a prefeitura. Outros prefixos observados: `301` (65 municípios), `601` (57), `602` (20), `302` (11), `701` (11), `603` (5), `303` (3), `304` (2), `305` (1), `610` (1).

Isso confirma, por um caminho totalmente independente do nome, que o código do diretório é o código do município usado dentro do dado.

**Unicidade.** Os 223 nomes resolvidos são 223 nomes distintos. Antes da resolução, `receitas-2025` sozinho produzia `Mataraca` duas vezes — foi esse sinal que expôs a Divergência 3.

**Características dos nomes**, medidas sobre os 223 resolvidos: comprimento máximo de 30 caracteres (`São Sebastião de Lagoa de Roça`, código `197`), mínimo de 4 (`Emas`, código `077`); 93 nomes (42%) contêm ao menos um caractere não-ASCII, no conjunto `Á Í á â ã ç é ê í ó ô õ ú`; dois nomes contêm apóstrofo `U+0027` (`Mãe d'Água`, código `110`, e `Olho d'Água`, código `130`); nenhum contém hífen; todos estão em forma Unicode NFC.

## Anomalia registrada e não explicada

Os códigos seguem ordem alfabética por nome, comparado sem acento e em minúscula, com **duas quebras**:

- `051 Tacima` seguido de `052 Capim` — a ordem esperaria algo entre `Campina Grande` e `Capim`.
- `174 Santana dos Garrotes` seguido de `175 Joca Claudino` — a ordem esperaria algo entre `Santana dos Garrotes` e `176 Santo André`.

A hipótese natural é renomeação de município posterior à atribuição dos códigos, mas **ela não foi confirmada na fonte**: os arquivos antigos não guardam o nome de época. `051/receitas/receitas-2003.zip` já traz `Tacima` e `175/despesas/despesas-2003.zip` já traz `Joca Claudino`, o que é consistente com a renormalização em bloco dos anos fechados feita em fevereiro de 2026.

Registrado como anomalia observada, não como erro de mapeamento: as 9 fontes concordam nesses dois códigos e os 223 nomes são únicos.

**A DEFINIR:** qual era o nome anterior dos municípios `051` e `175`, e quando mudaram? Nenhum arquivo do bucket responde. Resolver isso exige fonte externa (legislação estadual ou IBGE), fora do escopo em que esta coleta foi feita.

## Pendência conhecida — código IBGE

O código IBGE **não foi incluído** no CSV, deliberadamente, porque não existe fonte verificável para ele dentro do bucket. Nenhum dos 4 datasets tem coluna de código IBGE, e a varredura completa do bucket mostrou que, fora de `dados-consolidados/` e `dados-por-municipio/`, existem apenas 13 chaves: 11 PDFs em `portal-upas/`, sem relação com o projeto, e um `teste.txt`. `codigo_unidade_gestora` é código interno do TCE (`201<codigo>`), não é IBGE.

**A DEFINIR:** o projeto vai precisar do código IBGE — para cruzar com população, PIB municipal ou outras bases federais? Se sim, a via provável é a tabela de municípios do IBGE (`servicodedados.ibge.gov.br/api/v1/localidades/estados/25/municipios`), casada por nome normalizado. Os dois códigos fora de ordem alfabética descritos acima e a grafia `Olho d'Água` com apóstrofo são os pontos de atrito prováveis nesse casamento. A decisão de adicionar a coluna está registrada em [`adr/ADR-0002-dimensao-municipios.md`](adr/ADR-0002-dimensao-municipios.md).

## Erro cometido na coleta e corrigido, registrado para não se repetir

Uma primeira versão do coletor lia 65.536 bytes fixos de cada arquivo e acusava 7 arquivos como "não-UTF-8". Era corte no meio de caractere multibyte, defeito do coletor e não do dado. Relendo os arquivos inteiros, **os 223 são UTF-8 válido, com zero falhas de decodificação**. Truncar um stream UTF-8 em fronteira de byte arbitrária e decodificar o pedaço produz falso positivo de encoding — vale para qualquer leitura parcial que a ingestão venha a fazer.
