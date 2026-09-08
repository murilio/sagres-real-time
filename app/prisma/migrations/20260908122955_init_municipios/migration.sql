-- CreateTable
CREATE TABLE "municipios" (
    "codigo_tce" CHAR(3) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "nome_normalizado" VARCHAR(120) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("codigo_tce")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipios_nome_key" ON "municipios"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_nome_normalizado_key" ON "municipios"("nome_normalizado");

-- Daqui para baixo: SQL escrito a mao, fora do que o schema Prisma sabe
-- expressar. A ADR-0001 ja registra que parte do DDL vive nas migracoes.

-- O codigo do TCE tem exatamente 3 digitos com zero a esquerda. Em
-- CHAR(3) o Postgres completa com espaco quando recebe menos, entao
-- '1' vira '1  ' e este CHECK rejeita — que e o efeito desejado: o zero
-- a esquerda faz parte do caminho da URL da fonte e perde-lo produz 404.
ALTER TABLE "municipios"
  ADD CONSTRAINT "municipios_codigo_tce_formato"
  CHECK ("codigo_tce" ~ '^[0-9]{3}$');

-- Nome sem espaco nas bordas e nao vazio. O CSV de origem e gerado a
-- partir de campo de largura fixa em alguns datasets do TCE; espaco
-- residual criaria dois "Areia" diferentes para o indice unico.
ALTER TABLE "municipios"
  ADD CONSTRAINT "municipios_nome_limpo"
  CHECK (btrim("nome") <> '' AND "nome" = btrim("nome"));

-- A forma normalizada so admite A-Z, espaco e apostrofo — charset
-- verificado sobre os 223 nomes. Qualquer acento ou minuscula que
-- vaze da normalizacao falha aqui em vez de virar linha que a busca do
-- painel nunca encontra.
ALTER TABLE "municipios"
  ADD CONSTRAINT "municipios_nome_normalizado_formato"
  CHECK ("nome_normalizado" ~ '^[A-Z '']+$');

COMMENT ON TABLE "municipios" IS
  'Dimensao fechada: 223 municipios da Paraiba, codigos TCE 001..223 contiguos. Populada por packages/db/src/seed/municipios.ts a partir de prisma/seed/municipios-tce-pb.csv. Sem codigo IBGE: o TCE-PB nao publica o de-para.';

COMMENT ON COLUMN "municipios"."codigo_tce" IS
  'PK natural. Segmento de caminho da URL da fonte e sufixo de 3 digitos de codigo_unidade_gestora, o que permite resolver a FK das tabelas de fato por substring, sem lookup por linha.';

COMMENT ON COLUMN "municipios"."nome_normalizado" IS
  'Nome sem diacritico, caixa alta. O banco usa locale C: sem esta coluna, busca por "agua" nao encontra "Agua Branca".';
