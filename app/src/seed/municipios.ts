/**
 * Seed da dimensao `municipios`.
 *
 * Roda com `pnpm seed` (via `tsx`, sem build previo) ou automaticamente
 * em `prisma migrate reset`, via `migrations.seed` em prisma.config.ts.
 *
 * Propriedades exigidas:
 *
 * 1. Idempotente. Uma unica sentenca `INSERT ... ON CONFLICT DO UPDATE`
 *    cobre insercao e correcao. Rodar N vezes deixa 223 linhas.
 * 2. Falha alto. Toda divergencia entre o CSV e o contrato esperado
 *    aborta antes de tocar o banco. Popular parcialmente em silencio uma
 *    dimensao que vai receber FK de dezenas de milhoes de linhas de fato
 *    e pior que nao popular.
 * 3. Nao carimba `atualizado_em` sem necessidade. O `WHERE ... IS
 *    DISTINCT FROM` faz a coluna responder "quando este municipio mudou
 *    de nome", que e a unica pergunta que justifica a coluna existir.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createPrismaClient } from "../db";
import { Prisma } from "../generated/prisma/client";
import type { PrismaClient } from "../generated/prisma/client";

/**
 * Contrato de layout do CSV semente. Mesma politica que o CLAUDE.md
 * exige dos arquivos do TCE: conferir o cabecalho e falhar, em vez de
 * parsear uma coluna deslocada.
 */
const CABECALHO_ESPERADO = "codigo_tce;nome_municipio;fonte_url";

/**
 * A Paraiba tem 223 municipios e o TCE-PB numera de 001 a 223 sem
 * buraco — verificado varrendo as 16.502 chaves da listagem S3 do bucket
 * de dados abertos em 2026-09-08. Se este numero mudar, muda por lei
 * estadual de criacao de municipio, e a mudanca tem de ser deliberada.
 */
const TOTAL_MUNICIPIOS_PB = 223;

/**
 * O CSV e versionado junto do codigo, nao baixado em tempo de seed.
 *
 * Razao: o TCE-PB nao publica tabela de referencia de municipios — este
 * arquivo foi derivado do cruzamento de 4 datasets x 3 anos. Refaze-lo
 * exige baixar centenas de MB. Sao 25 KB de dado que muda por lei
 * estadual; versionar torna o setup reproduzivel em maquina nova e em CI,
 * sem rede e sem depender do bucket estar de pe.
 *
 * `__dirname` resolve tanto de `dist/seed/` quanto de `src/seed/`.
 */
const CAMINHO_CSV = join(
  __dirname,
  "..",
  "..",
  "prisma",
  "seed",
  "municipios-tce-pb.csv",
);

export type LinhaMunicipio = {
  codigoTce: string;
  nome: string;
  nomeNormalizado: string;
};

/**
 * Remove diacriticos e sobe para caixa alta.
 *
 * O banco roda com locale `C` (docker-compose.yml): comparacao e
 * ordenacao sao byte a byte, entao `ILIKE '%agua%'` nao encontra
 * `Agua Branca` e `ORDER BY nome` joga os acentuados para o fim. A busca
 * do painel e o casamento do `nome_municipio` que vem nos CSVs de fato
 * passam por esta forma.
 *
 * NFD separa a letra do acento combinante; o range U+0300–U+036F e o
 * bloco de diacriticos combinantes. O apostrofo de `Mae d'Agua` fica.
 */
export function normalizarNomeMunicipio(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function falhar(mensagem: string): never {
  throw new Error(`seed municipios: ${mensagem}`);
}

/**
 * Le e valida o CSV. Nao toca o banco.
 *
 * Parser proprio de 20 linhas em vez de dependencia: o arquivo e nosso,
 * o separador e `;`, nenhum nome contem `;`, aspas ou quebra de linha
 * (verificado). O parser tolerante da ingestao dos arquivos do TCE e
 * outro problema e vive em `packages/ingest-core`, quando existir.
 */
export function lerCsvMunicipios(caminho = CAMINHO_CSV): LinhaMunicipio[] {
  if (!existsSync(caminho)) {
    falhar(`arquivo semente nao encontrado em ${caminho}`);
  }

  // Os arquivos do TCE-PB vem UTF-8 com BOM. Este aqui nao tem, mas foi
  // derivado deles; descartar o BOM impede que um dia o codigo do
  // primeiro municipio vire "﻿001" e falhe o CHECK do banco.
  const bruto = readFileSync(caminho, "utf8").replace(/^﻿/, "");
  const linhas = bruto.split("\n").filter((linha) => linha.trim() !== "");

  const cabecalho = linhas[0];
  if (cabecalho !== CABECALHO_ESPERADO) {
    falhar(
      `cabecalho divergente. esperado ${JSON.stringify(CABECALHO_ESPERADO)}, ` +
        `lido ${JSON.stringify(cabecalho)}`,
    );
  }

  const dados = linhas.slice(1);
  if (dados.length !== TOTAL_MUNICIPIOS_PB) {
    falhar(`esperava ${TOTAL_MUNICIPIOS_PB} linhas de dado, li ${dados.length}`);
  }

  const registros: LinhaMunicipio[] = dados.map((linha, indice) => {
    const numeroLinha = indice + 2; // 1-based, com o cabecalho
    const campos = linha.split(";");
    if (campos.length !== 3) {
      falhar(`linha ${numeroLinha}: esperava 3 campos, li ${campos.length}`);
    }

    const codigoTce = campos[0] ?? "";
    const nome = campos[1] ?? "";

    if (!/^[0-9]{3}$/.test(codigoTce)) {
      falhar(
        `linha ${numeroLinha}: codigo ${JSON.stringify(codigoTce)} nao tem ` +
          `3 digitos. O zero a esquerda e significativo: e o segmento de ` +
          `caminho da URL da fonte.`,
      );
    }
    if (nome === "" || nome !== nome.trim()) {
      falhar(`linha ${numeroLinha}: nome ${JSON.stringify(nome)} vazio ou com espaco nas bordas`);
    }
    if (nome !== nome.normalize("NFC")) {
      falhar(
        `linha ${numeroLinha}: nome ${JSON.stringify(nome)} nao esta em NFC. ` +
          `Duas formas Unicode do mesmo nome viram duas linhas distintas ` +
          `para o indice unico.`,
      );
    }

    return { codigoTce, nome, nomeNormalizado: normalizarNomeMunicipio(nome) };
  });

  conferirConjuntoDeCodigos(registros);
  conferirUnicidade(registros);

  return registros;
}

/**
 * Os codigos precisam ser exatamente 001..223, contiguos.
 *
 * Contagem sozinha nao basta: 223 linhas com um codigo repetido e outro
 * faltando passariam pela contagem e deixariam um municipio de fora, com
 * as despesas dele orfas de FK na ingestao.
 */
function conferirConjuntoDeCodigos(registros: LinhaMunicipio[]): void {
  const presentes = new Set(registros.map((r) => r.codigoTce));
  const faltando: string[] = [];
  for (let i = 1; i <= TOTAL_MUNICIPIOS_PB; i += 1) {
    const codigo = String(i).padStart(3, "0");
    if (!presentes.has(codigo)) {
      faltando.push(codigo);
    }
  }
  if (faltando.length > 0) {
    falhar(`codigos ausentes na faixa 001..${TOTAL_MUNICIPIOS_PB}: ${faltando.join(", ")}`);
  }
}

function conferirUnicidade(registros: LinhaMunicipio[]): void {
  const checagens: Array<[string, (r: LinhaMunicipio) => string]> = [
    ["codigo_tce", (r) => r.codigoTce],
    ["nome", (r) => r.nome],
    ["nome_normalizado", (r) => r.nomeNormalizado],
  ];

  for (const [rotulo, extrair] of checagens) {
    const vistos = new Set<string>();
    const repetidos = new Set<string>();
    for (const registro of registros) {
      const valor = extrair(registro);
      if (vistos.has(valor)) {
        repetidos.add(valor);
      }
      vistos.add(valor);
    }
    if (repetidos.size > 0) {
      falhar(`valores repetidos em ${rotulo}: ${[...repetidos].join(", ")}`);
    }
  }
}

export type ResultadoSeed = {
  inseridos: number;
  atualizados: number;
  totalNaTabela: number;
};

/**
 * Escreve os 223 municipios em uma unica sentenca.
 *
 * Uma ida ao banco, nao 223 `upsert` do client. Nao e microotimizacao: e
 * o que permite a transacao inteira ser curta o bastante para segurar o
 * lock de tabela sem incomodar ninguem.
 */
export async function semearMunicipios(
  prisma: PrismaClient,
  registros: LinhaMunicipio[],
): Promise<ResultadoSeed> {
  return prisma.$transaction(async (tx) => {
    // Sem este lock, dois seeds simultaneos podem entrelacar os `count`
    // e reportar numeros errados, e dois `ON CONFLICT` concorrentes sobre
    // as mesmas chaves em ordens diferentes podem deadlockar. A tabela
    // tem 223 linhas e o seed e operacao de setup: o lock custa nada e
    // ainda permite leitura concorrente.
    await tx.$executeRaw`LOCK TABLE "municipios" IN SHARE ROW EXCLUSIVE MODE`;

    const antes = await tx.municipio.count();

    const valores = registros.map(
      (r) =>
        Prisma.sql`(${r.codigoTce}, ${r.nome}, ${r.nomeNormalizado}, now())`,
    );

    // O `WHERE ... IS DISTINCT FROM` faz duas coisas: mantem
    // `atualizado_em` significativo e evita gerar 223 versoes mortas de
    // tupla a cada execucao do seed.
    const escritas = await tx.$queryRaw<Array<{ codigo_tce: string }>>(
      Prisma.sql`
        INSERT INTO "municipios" ("codigo_tce", "nome", "nome_normalizado", "atualizado_em")
        VALUES ${Prisma.join(valores)}
        ON CONFLICT ("codigo_tce") DO UPDATE
          SET "nome"             = EXCLUDED."nome",
              "nome_normalizado" = EXCLUDED."nome_normalizado",
              "atualizado_em"    = now()
        WHERE "municipios"."nome"             IS DISTINCT FROM EXCLUDED."nome"
           OR "municipios"."nome_normalizado" IS DISTINCT FROM EXCLUDED."nome_normalizado"
        RETURNING "codigo_tce"
      `,
    );

    const depois = await tx.municipio.count();
    const inseridos = depois - antes;

    // Rede de seguranca dentro da mesma transacao: se a contagem final
    // nao bater, nada e comitado.
    if (depois !== TOTAL_MUNICIPIOS_PB) {
      falhar(
        `apos a carga a tabela tem ${depois} linhas, esperava ` +
          `${TOTAL_MUNICIPIOS_PB}. Transacao revertida.`,
      );
    }

    return {
      inseridos,
      atualizados: escritas.length - inseridos,
      totalNaTabela: depois,
    };
  });
}

async function main(): Promise<void> {
  // O `.env` da raiz da aplicacao e a fonte unica de credencial, e nada
  // no runtime do seed o carrega fora do Next.js. Mesmo mecanismo de
  // prisma.config.ts.
  const envDaRaiz = join(__dirname, "..", "..", ".env");
  if (existsSync(envDaRaiz)) {
    process.loadEnvFile(envDaRaiz);
  }

  const registros = lerCsvMunicipios();
  console.log(`seed municipios: ${registros.length} linhas lidas de ${CAMINHO_CSV}`);

  const prisma = createPrismaClient();
  try {
    const resultado = await semearMunicipios(prisma, registros);
    console.log(
      `seed municipios: ${resultado.inseridos} inseridos, ` +
        `${resultado.atualizados} atualizados, ` +
        `${resultado.totalNaTabela} na tabela`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Executa apenas quando chamado como programa; importar este modulo em
// um teste nao dispara escrita no banco.
if (require.main === module) {
  main().catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  });
}
