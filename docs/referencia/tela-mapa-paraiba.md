# Referência — mapa da Paraíba na tela inicial

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem for mexer no mapa, plugar dados nele ou criar a próxima tela do painel

Contrato da primeira tela do painel: qual biblioteca de mapa foi escolhida, de onde vêm as imagens de fundo (*tiles*), como o enquadramento inicial no estado da Paraíba é definido, e a restrição do App Router do Next.js que obriga o mapa a ser carregado por um arquivo intermediário. A definição autoritativa é o código; este documento explica as decisões que o código sozinho não conta.

O que existe hoje é **apenas o mapa base**: as imagens de fundo do OpenStreetMap, enquadradas na Paraíba, com zoom e deslocamento (*pan*) funcionando. Não há contorno de município desenhado, não há dado do banco plugado e não há interação além da navegação do próprio mapa.

## Arquivos

| Arquivo | Papel |
|---|---|
| `app/src/components/mapa-paraiba.tsx` | Client Component que monta o mapa: `MapContainer` e `TileLayer` do `react-leaflet`, mais o CSS do Leaflet |
| `app/src/components/mapa-paraiba-loader.tsx` | Client Component que existe só para isolar o `next/dynamic(..., { ssr: false })`; reexporta `MapaParaiba` |
| `app/app/page.tsx` | tela inicial: cabeçalho fixo com título e descrição, e o mapa ocupando o restante da altura da janela |
| `app/app/globals.css` | `html, body { height: 100% }`, necessário para o `100dvh` do layout da página inicial resolver para uma altura real |

`app/app/page.tsx` continua sendo um Server Component e importa `MapaParaiba` de `mapa-paraiba-loader`, nunca de `mapa-paraiba` diretamente.

## Dependências

Adicionadas a `app/package.json` com versão exata, sem `^`, seguindo a convenção já usada no resto do manifesto.

| Pacote | Versão | Onde |
|---|---|---|
| `leaflet` | 1.9.4 | `dependencies` |
| `react-leaflet` | 5.0.0 | `dependencies` |
| `@types/leaflet` | 1.9.22 | `devDependencies` |

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

## Verificação feita em 2026-09-08

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | sem erro |
| `pnpm build` | concluído; a rota `/` é gerada como estática |
| Teste visual no navegador | mapa carrega, com zoom e deslocamento funcionais, mostrando a Paraíba enquadrada e um pouco dos estados vizinhos nas bordas |

Não há teste automatizado sobre esta tela — não há infraestrutura de teste no projeto.
