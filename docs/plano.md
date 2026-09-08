# Plano — Monitor SAGRES TCE-PB

> **Estado:** vigente
> **Atualizado:** 2026-09-08
> **Público:** quem precisa entender o projeto inteiro antes de mexer em qualquer parte

Aplicação de fiscalização externa (watchdog) sobre os dados abertos do SAGRES do Tribunal de Contas do Estado da Paraíba. Coleta diária, painel público e motor de alertas sobre despesas, licitações, receitas e folha de pagamento dos 223 municípios paraibanos.

Stack definida: um único aplicativo Next.js (App Router), com a API em Route Handlers e Prisma sobre PostgreSQL — ver [`adr/ADR-0004-nextjs-unico.md`](adr/ADR-0004-nextjs-unico.md).

---

## 1. Fonte de dados (levantamento feito em 07/09/2026)

O TCE-PB publica os dados abertos do SAGRES em um bucket S3 público e listável, sem necessidade de token:

```
https://download.tce.pb.gov.br/dados-abertos/
├── dados-consolidados/
│   ├── despesas/despesas-{2003..2026}.zip
│   ├── licitacoes/licitacoes-{2015..2026}.zip
│   ├── receitas/receitas-{2003..2026}.zip
│   └── servidores/servidores-{2013..2026}.zip
├── dados-por-municipio/{001..223}/{despesas,licitacoes,receitas,servidores}/...
└── portal-upas/  (PDFs, irrelevante para o projeto)
```

Listagem do catálogo via API S3 padrão:

```
GET https://download.tce.pb.gov.br/dados-abertos/?list-type=2&max-keys=1000&prefix=dados-consolidados/
```

### Características

| Item | Valor |
|---|---|
| Formato | ZIP contendo um CSV por arquivo |
| Separador | `;` |
| Encoding | UTF-8 com BOM |
| Datas | `dd/MM/yyyy` |
| Números | padrão pt-BR (`25.499,48`), decimais omitidos quando zero (`8.748`, `485`) |
| Volume total | 3,54 GB compactado (2003–2026, consolidado) |
| Atualização | arquivos do ano corrente regerados diariamente por volta de 03:00 (06:00 UTC) |
| Anos fechados | congelados; foram reprocessados em bloco em 05–06/02/2026 |
| Autenticação | nenhuma |

O `Last-Modified` e o `ETag` de cada objeto são o gatilho de ingestão: basta um `HEAD` para saber se há dado novo.

Existe também a **SAGRES Captura API** (`https://sagrescaptura.tce.pb.gov.br/api`), porém exige token emitido pela ASTEC apenas para empresas cadastradas e autorizadas. Não é necessária para este projeto — os dados abertos cobrem o escopo.

### Esquemas reais dos CSVs

Os cabeçalhos abaixo são os das versões correntes (2026). **O layout não é estável entre anos dentro do mesmo dataset** — `despesas` e `servidores` têm duas versões de cabeçalho cada. O contrato exato, por dataset e por faixa de anos, com o método de verificação, está em [`referencia/layout-csv-sagres.md`](referencia/layout-csv-sagres.md). Quem for escrever o parser deve usar aquele documento, não este.

**despesas** (40 colunas, granularidade de empenho) — versão 2020–2026:

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

**licitacoes** (13 colunas, uma linha por proponente de cada certame) — cabeçalho único de 2015 a 2026:

```
nome_municipio; codigo_unidade_gestora; descricao_unidade_gestora; numero_licitacao;
numero_protocolo_tce; ano_licitacao; modalidade; objeto_licitacao; data_homologacao;
nome_proponente; cpf_cnpj_proponente; valor_ofertado; situacao_proposta
```

**receitas** (13 colunas, agregado mensal) — cabeçalho único de 2003 a 2026:

```
municipio; codigo_unidade_gestora; descricao_unidade_gestora; mes_ano; ano;
codigo_receita; descricao_receita; tipo_atualizacao_receita; valor;
codigo_fonte_recurso; descricao_fonte_recurso; co; descricao_co
```

**servidores** (11 colunas, folha mensal) — versão 2020–2026; nos anos de 2013 a 2019 a primeira coluna chama-se `municipio`, não `nome_municipio`:

```
nome_municipio; codigo_unidade_gestora; descricao_unidade_gestora; cpf_cnpj;
nome_servidor; tipo_cargo; descricao_cargo; valor_vantagem; data_admissao;
matricula; ano_mes
```

### Limitações da fonte que condicionam o desenho

1. **Não há identificador estável de registro.** Nenhum dataset traz um ID de linha. É preciso montar chave de negócio sintética (ex.: `codigo_unidade_gestora + ano + numero_empenho`) e um hash da linha inteira para detectar alteração.
2. **Os arquivos são snapshots completos, não incrementos.** Cada carga diária substitui o arquivo do ano. O "novo" precisa ser derivado por diferença contra o estado anterior no banco.
3. **CPF de servidor vem mascarado** (`***.539.694-**`). Cruzamento entre folha e credores só é possível por nome e matrícula, com risco de homônimo. O CNPJ/CPF de credores e proponentes vem completo, o que viabiliza análise de rede de fornecedores.
4. **Correções retroativas.** Prefeituras retificam remessas de anos anteriores. Monitorar só o ano corrente perde essas correções — que, aliás, são um sinal de fiscalização interessante por si só.
5. **Contrato de layout não é garantido — e já mudou.** Não é hipótese: `despesas` tem duas versões de cabeçalho (2003–2019 e 2020–2026) com o mesmo número de colunas e nomes diferentes, e `servidores` tem duas (2013–2019 e 2020–2026). Validar só a contagem de campos aceita o arquivo antigo em silêncio e grava o valor certo com o rótulo errado. A ingestão precisa validar a lista de nomes inteira a cada execução e falhar de forma ruidosa. Detalhe em [`referencia/layout-csv-sagres.md`](referencia/layout-csv-sagres.md).
6. **O CSV não é orientado a linha.** Campos entre aspas contêm quebra de linha embutida (observado em `descricao_receita`). Dividir o arquivo por `\n` corrompe registros — na coleta de 2026-09-08 isso produziu falsos nomes de município em 6 dos 223 códigos. O parser precisa ser RFC 4180. Há também byte NUL dentro de pelo menos um arquivo (`116/despesas/despesas-2025.csv`, 13 bytes `0x00`), que aborta leitores estritos e é rejeitado pelo `COPY` do Postgres em coluna `text`.
7. **O nome do município dentro do CSV não é confiável.** Diverge entre datasets em 3 dos 223 códigos e, no código `190`, aponta para o município errado em 22 anos de arquivos de `receitas`, por defeito de publicação do TCE-PB. Município se resolve pelo código do caminho ou pelos 3 últimos dígitos de `codigo_unidade_gestora`, nunca pelo campo de nome. Evidência em [`procedencia-municipios.md`](procedencia-municipios.md).
8. **Formato numérico ambíguo em valores redondos.** `350.000` pode ser trezentos e cinquenta mil ou trezentos e cinquenta com três decimais. A regra pt-BR (`.` = milhar, `,` = decimal) resolve na teoria, mas precisa ser validada contra totais conhecidos antes de confiar nos números.

---

## 2. Arquitetura

**Um único aplicativo Next.js com App Router.** Não há monorepo, não há NestJS e não há Redis/BullMQ. A API são Route Handlers do próprio Next.js, e a ingestão diária é uma Route Handler protegida por segredo compartilhado, acionada por um cron externo (Vercel Cron ou cron de sistema). A decisão, sua motivação e o que ela substitui estão em [`adr/ADR-0004-nextjs-unico.md`](adr/ADR-0004-nextjs-unico.md).

Todo o código vive na pasta `app/` do repositório — `package.json`, `pnpm-lock.yaml`, `docker-compose.yml`, `.env`, `next.config.ts` e `tsconfig.json` ficam lá, e todo comando `pnpm` ou `docker compose` roda com `app/` como diretório de trabalho. `docs/`, `README.md`, `CLAUDE.md`, `CONTEXT-DATA.md`, `.gitignore` e `.claude/` continuam na raiz do repositório.

Estrutura existente em 2026-09-08, verificada no disco:

```
app/
  package.json          manifesto único, name "sagres-real-time"
  next.config.ts  tsconfig.json  prisma.config.ts
  docker-compose.yml
  .env  .env.example  .nvmrc  .npmrc
  prisma/
    schema.prisma
    migrations/20260908122955_init_municipios/
    seed/municipios-tce-pb.csv
  src/
    db.ts                 client Prisma — único ponto que instancia PrismaClient
    generated/prisma/     saída do `prisma generate`, não versionada
    seed/municipios.ts    seed da dimensão `municipios`
    scripts/              scripts de execução única, fora do runtime
      baixar-contornos-municipios.ts
    components/           componentes de tela
      mapa-paraiba.tsx  mapa-paraiba-loader.tsx
  app/                    App Router
    layout.tsx  page.tsx  globals.css
  public/geo/             assets estáticos gerados e versionados
    paraiba-municipios.geojson
```

Isso é o estado atual, não um layout-alvo: o que existe é o banco com a dimensão `municipios` (contrato em [`referencia/dimensao-municipios.md`](referencia/dimensao-municipios.md)) e a tela inicial do painel com o mapa da Paraíba e os contornos do estado e dos 223 municípios, ainda sem dado do banco plugado (contrato em [`referencia/tela-mapa-paraiba.md`](referencia/tela-mapa-paraiba.md)). **Ainda não existem** a Route Handler de ingestão, o motor de regras nem qualquer teste automatizado.

Como o código cresce dentro do app único — onde ficam parsers de CSV, contratos de layout, tipos compartilhados e regras de negócio, hoje sem fronteira imposta pelo gerenciador de pacotes — é **A DEFINIR**. A convenção de diretórios ainda não foi decidida.

### Ingestão sem worker separado

A arquitetura anterior separava um processo `worker` da API porque a ingestão consome CPU e memória de forma intensa por alguns minutos por dia, e executá-la junto do atendimento de requisições degrada a latência do painel. Essa restrição não desapareceu; a separação de processos, sim. O custo foi assumido conscientemente ao trocar por uma base de código única (ADR-0004, "Consequências").

Em 2026-09-08 uma revisão de arquitetura de backend produziu orientações de desenho para essa ingestão — onde ela executa, como duas execuções são impedidas de se atropelar e como o endpoint de gatilho é protegido. Elas estão em [`desenho-ingestao.md`](desenho-ingestao.md) e são **orientação a seguir quando o código for escrito, não decisão fechada**: nada foi implementado e não há ADR própria. O ponto de arquitetura que sai de lá: o trabalho pesado não roda dentro da Route Handler em nenhum cenário — ela é um gatilho fino que registra a execução e responde `202`, e o processamento fica num binário chamado diretamente pelo cron.

**A DEFINIR: a plataforma de deploy**, e com ela o ramo de execução da ingestão. Perguntado em 2026-09-08, o usuário respondeu que ainda não está decidido. As orientações de proteção do endpoint e de exclusão mútua não dependem dessa escolha; as de tempo de execução, sim.

### Infraestrutura

- **PostgreSQL 16** — banco principal, com particionamento por ano nas tabelas grandes
- **Object storage** (opcional) — guardar os ZIPs baixados para reprocessamento sem rebaixar da fonte
- **Deploy** — um artefato só, o app Next.js. A plataforma é **A DEFINIR** por resposta explícita do usuário em 2026-09-08; a escolha está acoplada ao limite de duração de execução da rota de ingestão ([`desenho-ingestao.md`](desenho-ingestao.md), seção 1).

Redis deixou de fazer parte do dimensionamento: não há fila BullMQ.

## 3. Pipeline de ingestão

Cron externo diário às 07:00 UTC (uma hora após a janela de regeneração do TCE), acionando a ingestão — ver seção 2, "Ingestão sem worker separado", e [`desenho-ingestao.md`](desenho-ingestao.md) para as orientações de desenho e para o que ainda está em aberto.

```
1. HEAD nos 4 arquivos consolidados do ano corrente
   └─ compara Last-Modified/ETag com a tabela arquivo_versoes
   └─ se inalterado, encerra a execução do dataset

2. Download do ZIP → stream de descompactação → parse do CSV
   └─ valida o cabeçalho contra o contrato de layout esperado
   └─ normaliza: números pt-BR → numeric(18,2), datas → date, trim, uppercase de chaves

3. COPY para tabela de staging (UNLOGGED, truncada a cada carga)

4. MERGE staging → tabelas fato
   ├─ INSERT das chaves novas          → evento "registro_novo"
   ├─ UPDATE onde o hash da linha mudou → evento "registro_alterado" + snapshot na tabela de histórico
   └─ chaves ausentes do snapshot       → evento "registro_removido"

5. Refresh das materialized views de agregação

6. Motor de regras consome os eventos → gera alertas → dispara notificações
```

**Usar os arquivos consolidados, não os por município.** São 4 downloads/dia (~400 MB) contra 892 arquivos. Os arquivos por município servem para backfill paralelizado e para recarga cirúrgica de um município específico.

**Varredura semanal de anos fechados:** `HEAD` em todos os anos históricos uma vez por semana, para capturar retificações retroativas.

**Backfill inicial:** carga única do histórico, executada fora do cron, em lotes por ano.

---

## 4. Modelo de dados

### Dimensões

`municipios` (**única existente hoje** — contrato em [`referencia/dimensao-municipios.md`](referencia/dimensao-municipios.md), modelagem em [`adr/ADR-0002-dimensao-municipios.md`](adr/ADR-0002-dimensao-municipios.md)), `unidades_gestoras`, `unidades_orcamentarias`, `fornecedores` (chave `cpf_cnpj`, com `raiz_cnpj` de 8 dígitos derivada para agrupar matriz/filial), `naturezas_despesa`, `funcoes`, `subfuncoes`, `programas`, `acoes`, `fontes_recurso`, `codigos_receita`, `cargos`

### Fatos

| Tabela | Grão | Chave de negócio |
|---|---|---|
| `empenhos` | um empenho | `unidade_gestora_id + ano + numero_empenho` |
| `licitacao_propostas` | uma proposta | `unidade_gestora_id + ano + numero_licitacao + cpf_cnpj_proponente` |
| `receitas_mensais` | mês × código de receita × fonte | `unidade_gestora_id + mes_ano + codigo_receita + codigo_fonte_recurso` |
| `folha_mensal` | servidor × mês | `unidade_gestora_id + matricula + ano_mes` |

Todas com `row_hash`, `primeira_carga_em`, `ultima_carga_em`, `versao`.

### Histórico de alterações

`empenho_versoes` e equivalentes guardam o valor anterior sempre que o hash muda. Isso permite a consulta "quais empenhos tiveram valor alterado depois de homologados" — um sinal de fiscalização que ninguém que só lê o snapshot atual consegue produzir. É o principal diferencial técnico do projeto.

### Operacional

`ingest_runs`, `arquivo_versoes`, `layout_contratos`, `regras`, `alertas`, `watchlists`, `usuarios`, `notificacoes`

### Performance

- Particionar `empenhos` e `folha_mensal` por ano (`PARTITION BY RANGE (ano)`)
- Índices: `(municipio_id, data_empenho)`, `(fornecedor_id, ano)`, `(unidade_gestora_id, ano)`
- `pg_trgm` + índice GIN em `historico` e `objeto_licitacao` para busca textual
- Materialized views: despesa mensal por município, top fornecedores por UG/ano, indicadores por município

### Dimensionamento

O consolidado de despesas de 2026 tem 135 MB compactados após 8 meses; a série completa 2003–2026 soma 2,3 GB compactados só nesse dataset. Estimativa grosseira de 60 a 100 milhões de linhas no histórico completo, o que em Postgres com índices pode passar de 60 GB.

**Recomendação para o MVP:** carregar apenas 2024–2026. O histórico completo entra na Fase 4, e vale considerar Parquet + DuckDB para o dado frio, mantendo no Postgres apenas os três anos quentes.

---

## 5. Motor de regras e alertas

O valor do produto não está em exibir os dados — o próprio TCE já faz isso. Está em detectar padrões. Regras propostas, da mais simples para a mais elaborada:

1. **Fornecedor recém-criado com contrato alto** — CNPJ com primeira aparição no SAGRES recebendo valor acima de um limiar logo no primeiro mês.
2. **Fracionamento de despesa** — mesmo credor, mesma UG, mesmo elemento de despesa, várias dispensas em janela de 90 dias somando acima do limite legal para dispensa.
3. **Excesso de dispensa e inexigibilidade** — percentual de dispensas de uma UG muito acima da mediana estadual.
4. **Empenho alterado retroativamente** — valor ou credor modificado após a carga inicial. Só detectável com o histórico de versões.
5. **Remessa omissa ou atrasada** — UG sem registros novos há N dias, comparada ao seu próprio padrão histórico.
6. **Concentração de fornecedor** — um único credor concentrando mais de X% da despesa da UG no ano.
7. **Licitação com proponente único** ou com múltiplas propostas de empresas de mesma raiz de CNPJ.
8. **Acumulação de cargo** — mesmo nome e data de admissão aparecendo em duas ou mais UGs no mesmo mês.
9. **Remuneração fora da faixa do cargo** — outlier estatístico dentro do mesmo `descricao_cargo` no estado.
10. **Sobrepreço** — preço unitário muito acima da mediana estadual para o mesmo objeto. Exige extração estruturada do campo `historico`, que é texto livre. Fase posterior.

Cada regra emite um **indício**, com severidade, evidência (as linhas que a dispararam) e link para a fonte original. Consolidados em um **score de risco por município** que alimenta um ranking na home.

Ponto importante de produto: a interface precisa ser explícita de que um alerta é indício, não irregularidade comprovada. Cada alerta mostra a metodologia da regra e permite baixar as linhas de origem. Isso protege o projeto e torna o resultado utilizável por jornalista, vereador ou Ministério Público.

---

## 6. API (Route Handlers do Next.js)

Áreas de endpoint: `auth`, `municipios`, `unidades-gestoras`, `despesas`, `licitacoes`, `receitas`, `servidores`, `fornecedores`, `alertas`, `watchlist`, `busca`, `export`, `admin-ingest`.

- Paginação por cursor em todos os endpoints de listagem
- Filtros combináveis: município, UG, ano, faixa de datas, natureza, elemento, credor, faixa de valor
- Leitura pesada e dado imutável até a próxima carga diária → cache agressivo com invalidação no fim de cada ingestão. **A DEFINIR:** qual camada de cache, agora que não há Redis no dimensionamento — cache do próprio Next.js, materialized views ou outra coisa.
- Endpoints de agregação servidos pelas materialized views, nunca por `SUM()` sobre a tabela fato
- Exportação CSV/JSON de qualquer consulta, com a mesma licença de dado aberto da fonte

---

## 7. Front

Telas do MVP:

- **Home** — ranking de risco dos municípios, feed de alertas recentes, totais do estado
- **Município** — perfil, séries de despesa e receita, UGs, top fornecedores, alertas abertos
- **Fornecedor** — perfil por CNPJ, municípios atendidos, série temporal, rede de empresas com mesma raiz de CNPJ, licitações disputadas
- **Licitação** — certame, propostas, vencedor, empenhos vinculados via `numero_licitacao`
- **Folha** — busca de servidores, distribuição salarial por cargo e UG
- **Busca global** — full text sobre histórico de empenho e objeto de licitação
- **Watchlist** — usuário acompanha município, UG ou fornecedor e recebe alertas por e-mail

Server Components lendo o banco pelo client de `app/src/db.ts` ou consumindo as Route Handlers, gráficos com Recharts, tabelas virtualizadas para resultados grandes. Front e API são o mesmo aplicativo.

**Implementado em 2026-09-08:** a tela inicial existe e mostra um mapa base do estado da Paraíba, em Leaflet com `react-leaflet` e imagens de fundo do OpenStreetMap. É só o mapa — não há contorno de município desenhado, nenhum dado do banco plugado e nenhum dos itens de conteúdo da Home listados acima (ranking de risco, feed de alertas, totais do estado). A escolha da biblioteca de mapa, a decisão de enquadrar por caixa delimitadora fixa em vez de ponto central com zoom, e a restrição do App Router que obriga o mapa a ser carregado por um Client Component intermediário estão em [`referencia/tela-mapa-paraiba.md`](referencia/tela-mapa-paraiba.md).

**Incremento em 2026-09-08:** o mapa ganhou o contorno do estado e o contorno de cada um dos 223 municípios, desenhados como camada `GeoJSON` sobre as imagens de fundo. Os polígonos vêm da API de Malhas Territoriais do IBGE, baixados por um script de execução única (`pnpm geo:baixar`) e gravados como asset estático versionado em `app/public/geo/paraiba-municipios.geojson`; cada município carrega o `codigo_tce`, que é a chave de junção com a tabela `municipios`. Continua **sem nenhum dado do banco plugado** e sem os itens de conteúdo da Home listados acima. A fonte escolhida, o motivo de o Nominatim ter sido descartado, o casamento por nome com a semente do TCE-PB e a estrutura do arquivo estão em [`referencia/tela-mapa-paraiba.md`](referencia/tela-mapa-paraiba.md).

---

## 8. Roadmap

**Fase 0 — Spike de ingestão (1 semana).** Baixar os quatro datasets do ano corrente, parsear inteiro, contar linhas, validar o parser numérico contra totais conhecidos, medir o volume real em Postgres. Decidir Postgres puro versus Postgres + DuckDB. Sem esse número, o resto do dimensionamento é chute.

**Fase 1 — Núcleo de dados (2 a 3 semanas).** Schema, migrações, ingestão diária consolidada com detecção de diferença, backfill de 2024–2026, API de leitura com filtros e paginação.

**Fase 2 — Painel (2 semanas).** Telas de município, fornecedor e licitação. Busca global. Exportação.

> Iniciada fora de ordem em 2026-09-08, antes das fases 0 e 1: a tela inicial ganhou o mapa base da Paraíba e, no mesmo dia, o contorno do estado e dos 223 municípios a partir da malha do IBGE — ainda sem nenhum dado do banco plugado. Ver seção 7 e [`referencia/tela-mapa-paraiba.md`](referencia/tela-mapa-paraiba.md). Nenhum outro item desta fase foi feito.

**Fase 3 — Fiscalização (2 a 3 semanas).** Motor de regras, tabela de alertas, score de risco, watchlist e notificação por e-mail. É aqui que o produto deixa de ser um espelho do portal do TCE.

**Fase 4 — Profundidade.** Backfill histórico completo, rede de fornecedores, extração estruturada do campo `historico`, detecção de sobrepreço, API pública.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Layout do CSV muda sem aviso | Contrato de cabeçalho versionado, validação a cada carga, falha ruidosa e alerta ao operador |
| Ausência de ID estável gera duplicata ou falso "registro alterado" | Chave de negócio + `row_hash`; monitorar taxa de alteração por carga e investigar picos |
| Correções retroativas passam despercebidas | Varredura semanal de `Last-Modified` em todos os anos |
| Volume estoura o banco e o orçamento | MVP com 3 anos; histórico frio em Parquet/DuckDB |
| Fonte fica indisponível ou muda de endereço | Guardar os ZIPs baixados em object storage; ingestão idempotente e reexecutável a partir do arquivo salvo |
| Alerta lido como acusação | Linguagem de indício, metodologia publicada, evidência e link para a fonte em todo alerta, canal de contestação |
| Exposição de dados pessoais | Não republicar CPF; a folha já vem mascarada na origem e deve permanecer assim; agregação sem perfilamento individual desnecessário |

---

## 10. Primeira decisão a tomar

Rodar a Fase 0 antes de escrever qualquer linha de schema. O número de linhas reais e o tamanho ocupado em Postgres determinam se o histórico completo cabe no plano ou se o projeto começa com três anos. Tudo depois disso depende dessa medida.

**Nota de 2026-09-08.** Essa ordem não foi seguida à risca: a dimensão `municipios` foi modelada e populada antes da Fase 0. A exceção se justifica porque `municipios` é uma dimensão fechada de 223 linhas, cujo dimensionamento não depende de nenhuma medição de volume. A recomendação continua valendo para as tabelas de fato, que são as que o dimensionamento decide.
