# Referência — mapa da Paraíba na tela inicial

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem for mexer no mapa, plugar dados nele ou criar a próxima tela do painel

Contrato da primeira tela do painel: qual biblioteca de mapa foi escolhida, de onde vêm as imagens de fundo (*tiles*), de onde vêm os contornos do estado e dos 223 municípios, como o enquadramento inicial no estado da Paraíba é definido, e a restrição do App Router do Next.js que obriga o mapa a ser carregado por um arquivo intermediário. A definição autoritativa é o código; este documento explica as decisões que o código sozinho não conta.

O que existe hoje é o **mapa base mais os contornos**: as imagens de fundo do OpenStreetMap enquadradas na Paraíba, com zoom e deslocamento (*pan*) funcionando, e por cima delas o contorno do estado e o contorno de cada um dos 223 municípios, desenhados a partir de um arquivo GeoJSON estático versionado no repositório. **Não há dado do banco plugado no mapa** e não há interação além da navegação do próprio mapa: os contornos são apenas linhas, sem preenchimento por cor e sem clique.

## Arquivos

| Arquivo | Papel |
|---|---|
| `app/src/components/mapa-paraiba.tsx` | Client Component que monta o mapa: `MapContainer` e `TileLayer` do `react-leaflet`, mais o CSS do Leaflet |
| `app/src/components/mapa-paraiba-loader.tsx` | Client Component que existe só para isolar o `next/dynamic(..., { ssr: false })`; reexporta `MapaParaiba` |
| `app/app/page.tsx` | tela inicial: cabeçalho fixo com título e descrição, e o mapa ocupando o restante da altura da janela |
| `app/app/globals.css` | `html, body { height: 100% }`, necessário para o `100dvh` do layout da página inicial resolver para uma altura real |
| `app/src/scripts/baixar-contornos-municipios.ts` | script de execução única (`pnpm geo:baixar`) que baixa a malha do IBGE e gera o GeoJSON dos contornos |
| `app/public/geo/paraiba-municipios.geojson` | saída do script, versionada; asset estático servido pelo Next.js em `/geo/paraiba-municipios.geojson` |

`app/app/page.tsx` continua sendo um Server Component e importa `MapaParaiba` de `mapa-paraiba-loader`, nunca de `mapa-paraiba` diretamente.

## Dependências

Adicionadas a `app/package.json` com versão exata, sem `^`, seguindo a convenção já usada no resto do manifesto.

| Pacote | Versão | Onde |
|---|---|---|
| `leaflet` | 1.9.4 | `dependencies` |
| `react-leaflet` | 5.0.0 | `dependencies` |
| `@types/leaflet` | 1.9.22 | `devDependencies` |
| `@types/geojson` | 7946.0.16 | `devDependencies` |

## Stack de mapa

**Leaflet com o invólucro `react-leaflet`, e imagens de fundo do OpenStreetMap.** A combinação não exige chave de API, cadastro nem cartão de crédito: as URLs de *tile* do OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, em `app/src/components/mapa-paraiba.tsx:24`) são públicas, o que mantém o projeto executável por qualquer pessoa que clone o repositório sem precisar provisionar conta em serviço de mapas.

A atribuição ao OpenStreetMap é obrigatória pela licença dos dados e está no `TileLayer` (`app/src/components/mapa-paraiba.tsx:22-25`). Ela não pode ser removida da tela.

**A DEFINIR:** o uso de *tiles* do servidor público do OpenStreetMap está sujeito à política de uso dessa organização, que restringe tráfego de aplicação em produção. Não foi verificado nesta sessão se o volume esperado do painel cabe nessa política, nem qual provedor de *tiles* seria usado em produção.

## Enquadramento: `bounds`, não `center` + `zoom`

O `MapContainer` recebe `bounds` com uma caixa delimitadora fixa da Paraíba — canto sudoeste `[-8.32, -38.8]` e canto nordeste `[-6.0, -34.7]` — em `app/src/components/mapa-paraiba.tsx:10-13`. A caixa tem folga sobre o contorno real do estado, de modo que o estado inteiro cabe no enquadramento inicial.

A alternativa seria fixar um ponto central mais um nível de zoom. Ela foi descartada porque um par `center` + `zoom` só enquadra corretamente em uma proporção de tela: o mesmo zoom que mostra o estado inteiro em um monitor largo corta as pontas em uma janela estreita ou em telefone. Com `bounds`, o Leaflet calcula o zoom que faz a caixa caber no contêiner disponível, e o enquadramento se mantém correto em qualquer tamanho de tela.

Consequência aceita: como a caixa raramente tem a mesma proporção do contêiner, sobra área nas bordas e aparecem trechos dos estados vizinhos. Isso é o comportamento esperado do ajuste por caixa, não um defeito de configuração.

## A restrição do `ssr: false` no App Router

O Leaflet manipula o DOM diretamente e depende de `window`; ele não funciona no processo servidor do Next.js. Por isso o componente do mapa precisa ser carregado apenas no navegador, o que se obtém com `next/dynamic` e a opção `ssr: false`.

No App Router do Next.js 16 essa opção **não é permitida dentro de um Server Component**. Como `app/app/page.tsx` é Server Component por padrão, colocar o `next/dynamic` com `ssr: false` diretamente nele faz o `next dev` falhar com:

```
Error: `ssr: false` is not allowed with `next/dynamic` in Server Components
```

Esse erro foi reproduzido e corrigido em 2026-09-08. A solução aplicada é a que o próprio Next.js indica: mover o `next/dynamic` para dentro de um Client Component separado. É essa, e apenas essa, a razão de `app/src/components/mapa-paraiba-loader.tsx` existir — ele não tem lógica própria, marca `"use client"` e reexporta o componente carregado dinamicamente (`app/src/components/mapa-paraiba-loader.tsx:10`).

**Vale para a próxima tela.** Qualquer biblioteca que só funcione no navegador cai na mesma armadilha. O padrão a repetir é o par de arquivos: um componente `"use client"` com o conteúdo, e um carregador `"use client"` separado que faz o `next/dynamic` com `ssr: false`, sendo o carregador o único importado pela página.

## Contornos do estado e dos municípios

Acrescentados em 2026-09-08, depois do mapa base.

### Fonte: API de Malhas Territoriais do IBGE

Os contornos vêm da API de Malhas Territoriais do IBGE (`https://servicodados.ibge.gov.br/api/v3/malhas/estados/25`), com o parâmetro `formato=application/vnd.geo+json`. São dois pedidos ao mesmo endereço: um sem parâmetro adicional, que devolve o contorno do estado como uma única *feature*, e outro com `&intrarregiao=municipio`, que devolve **os 223 municípios em uma única resposta HTTP** — não são 223 requisições. Um terceiro pedido, à API de Localidades (`/api/v1/localidades/estados/25/municipios`), traz os nomes, porque a malha só carrega o código IBGE da área (`codarea`) e nenhum nome.

O parâmetro `qualidade` controla o nível de detalhe do polígono. Foi fixado em `intermediaria` (`app/src/scripts/baixar-contornos-municipios.ts:39`). As três opções foram medidas nesta sessão, para os 223 municípios:

| `qualidade` | Tamanho da resposta | Avaliação |
|---|---|---|
| `minima` | ~86 KB | contorno grosseiro demais para zoom no nível de município |
| `intermediaria` | ~215 KB | escolhida: fidelidade suficiente com o menor arquivo aceitável |
| `maxima` | ~840 KB | mais detalhe do que o painel precisa |

O contorno isolado do estado, em `intermediaria`, ocupa 7,2 KB. O arquivo final gravado tem 215.739 bytes.

O IBGE exige atribuição para reuso da malha. Ela aparece em dois lugares: no campo `fonte` na raiz do próprio GeoJSON, junto do dado, e no controle de atribuição do mapa, somada à do OpenStreetMap (`app/src/components/mapa-paraiba.tsx:66`), que na tela aparece como `OpenStreetMap — contornos: IBGE`.

### Por que não o Nominatim

A primeira ideia levantada foi consultar a API de busca do Nominatim (`https://nominatim.openstreetmap.org/search`) uma vez por município, pelo nome, e juntar os resultados em um GeoJSON. Ela foi testada e descartada por dois defeitos concretos, ambos observados em execução real nesta sessão:

1. **O resultado é ambíguo e o erro seria silencioso.** A consulta pelo nome "Bananeiras" devolveu dois resultados distintos: um com `addresstype: "municipality"`, com 1355 pontos, que é o contorno correto do município inteiro, e outro com `addresstype: "city_district"`, com 373 pontos, que é um distrito interno. Um script que pegasse o primeiro resultado gravaria o polígono errado, e nada na saída indicaria a troca. O risco vale para qualquer um dos 223 nomes, e conferir 223 polígonos a olho não é revisão viável.
2. **O arquivo resultante seria grande demais para o cliente.** Um único município, sem simplificação de geometria, já pesou 43 KB (contando os dois resultados). Extrapolando para 223 municípios, o total ficaria na casa de dezenas de megabytes — inviável para carregar de uma vez no navegador, e o Nominatim não oferece um parâmetro de simplificação equivalente ao `qualidade` do IBGE.

Somam-se a isso dois pontos de contexto: a política de uso do Nominatim pede moderação em coleta em lote (uma requisição por segundo e `User-Agent` identificando a aplicação), o que tornaria a coleta dos 223 municípios um processo de vários minutos com risco de bloqueio; e o dado do OpenStreetMap é editado pela comunidade, não é fonte oficial de limite territorial. A malha do IBGE é dado oficial do governo, resolve os 223 em uma requisição e não tem limite de taxa publicado.

A troca do Nominatim pelo IBGE foi decidida com concordância explícita do usuário antes da implementação.

### Como o município do IBGE vira `codigo_tce`

A malha do IBGE identifica cada município apenas pelo código IBGE. O resto do projeto usa o código de três dígitos do TCE-PB como chave — e o projeto **não armazena** `codigo_ibge`, porque não foi encontrada fonte pública que ligue os dois códigos (lacuna registrada em [`../adr/ADR-0002-dimensao-municipios.md`](../adr/ADR-0002-dimensao-municipios.md)).

O casamento é então feito **por nome normalizado** contra o CSV semente `app/prisma/seed/municipios-tce-pb.csv`, reaproveitando a função `normalizarNomeMunicipio` que já existe em `app/src/seed/municipios.ts` — a mesma normalização usada pelo seed do banco, importada e não duplicada (`app/src/scripts/baixar-contornos-municipios.ts:31`). Antes de escrever o script, foi verificado nesta sessão que os 223 nomes do IBGE batem 1 para 1 com os nomes da semente do TCE-PB, sem nenhuma colisão de normalização.

O script falha alto em vez de gravar resultado parcial. Ele aborta se a malha vier com um número de *features* diferente do total da semente, se algum nome do IBGE não encontrar correspondência, se um `codigo_tce` receber duas *features*, ou se o total casado não fechar com o da semente (verificações em `app/src/scripts/baixar-contornos-municipios.ts:102-168`).

### Regeneração

```
pnpm geo:baixar
```

O script está registrado em `app/package.json` e roda com `app/` como diretório de trabalho. Ele **não é caminho de execução (*runtime*)**: é rodado à mão e o resultado é versionado no repositório, no mesmo espírito do CSV semente. A malha territorial só muda por lei estadual que crie, extinga ou altere limite de município — não é dado que precise ser buscado a cada requisição ou a cada implantação. O componente do mapa lê o arquivo estático, nunca o IBGE (`app/src/components/mapa-paraiba.tsx:21`).

## Estrutura do GeoJSON gerado

Arquivo: `app/public/geo/paraiba-municipios.geojson`, servido em `/geo/paraiba-municipios.geojson`.

É um único `FeatureCollection` com **224 *features***: uma do estado e 223 dos municípios. Geometrias são `Polygon` ou `MultiPolygon`. Além dos campos padrão do GeoJSON, a raiz da coleção carrega um campo `fonte` com a atribuição do IBGE. O JSON é gravado sem indentação, de propósito: é dado gerado e regenerável, não arquivo para editar à mão.

As *features* se distinguem pela propriedade `tipo`, e cada tipo tem seu próprio conjunto de propriedades:

| `tipo` | Quantidade | Propriedades |
|---|---|---|
| `estado` | 1 | `codigo_uf` (`"25"`), `nome` (`"Paraíba"`) |
| `municipio` | 223 | `codigo_tce`, `codigo_ibge`, `nome` |

**`codigo_tce` é a chave de junção com o banco.** É exatamente a mesma chave primária natural da tabela `municipios` (contrato em [`dimensao-municipios.md`](dimensao-municipios.md)), de três dígitos com zeros à esquerda, no formato `"001"`. Isso permite ao front juntar o GeoJSON com qualquer resultado de consulta ao banco por essa chave, sem tabela de tradução nem busca adicional. `codigo_ibge` fica gravado no arquivo como procedência do polígono; ele não existe em nenhuma tabela do banco.

O tipo das propriedades está declarado em `app/src/components/mapa-paraiba.tsx:23-25` como união discriminada por `tipo`.

## Desenho dos contornos na tela

O componente busca o GeoJSON no navegador, depois da montagem, com `fetch` dentro de um `useEffect` (`app/src/components/mapa-paraiba.tsx:42-57`), e só renderiza a camada `<GeoJSON>` do `react-leaflet` quando o arquivo chega. A camada fica por cima do `TileLayer`.

O estilo é decidido por *feature*, pela propriedade `tipo` (`app/src/components/mapa-paraiba.tsx:27-37`):

| Tipo | Traço | Preenchimento |
|---|---|---|
| `estado` | azul (`#1d4ed8`), espessura 2 | nenhum |
| `municipio` | cinza (`#64748b`), espessura 1 | nenhum |

**A DEFINIR:** transformar isso em mapa coroplético — preencher cada município com uma cor conforme algum indicador de fiscalização — está registrado como intenção em comentário no código, mas **não é decisão tomada**. Não existe indicador definido para mapear em cor, nem escala de cor escolhida, nem dado plugado. Qual indicador vai colorir o mapa é pergunta em aberto.

## Verificação feita em 2026-09-08

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | sem erro |
| `pnpm build` | concluído; a rota `/` é gerada como estática |
| Teste visual no navegador | mapa carrega, com zoom e deslocamento funcionais, mostrando a Paraíba enquadrada e um pouco dos estados vizinhos nas bordas |
| Teste visual no navegador (Chrome), após os contornos | contorno do estado e dos 223 municípios desenhados corretamente sobre as imagens de fundo, com a atribuição "OpenStreetMap — contornos: IBGE" visível |
| `pnpm geo:baixar` | executado; gravou 224 *features* em `app/public/geo/paraiba-municipios.geojson`, 215.739 bytes, sem disparar nenhuma das verificações de falha |

Não há teste automatizado sobre esta tela — não há infraestrutura de teste no projeto.
