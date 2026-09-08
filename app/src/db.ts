/**
 * Ponto de entrada do client Prisma da aplicacao.
 *
 * Unico lugar que instancia `PrismaClient`. Route Handlers, Server
 * Components e o script de ingestao importam daqui.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { Pool as PgPool } from "pg";

import { PrismaClient } from "./generated/prisma/client";

export { PrismaClient } from "./generated/prisma/client";
export type { Prisma } from "./generated/prisma/client";

// `connection_limit` na query string da URL e convencao do engine nativo
// do Prisma (removido na v7): o driver `pg` nao le esse parametro, entao
// declara-lo na DATABASE_URL nao limita nada. Com driver adapter, o teto
// do pool e o `max` passado aqui a `pg.Pool` — por isso o valor tem que
// vir de uma env propria, nao da URL.
const DEFAULT_POOL_MAX = 10;

function tamanhoDoPool(): number {
  const bruto = process.env.DATABASE_POOL_MAX;
  if (bruto === undefined) {
    return DEFAULT_POOL_MAX;
  }
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(
      `DATABASE_POOL_MAX precisa ser um inteiro positivo, recebido "${bruto}".`,
    );
  }
  return valor;
}

export type PrismaClientOptions = {
  /**
   * URL de conexao. Ignorada quando `pool` e informado.
   * Padrao: `process.env.DATABASE_URL`.
   */
  connectionString?: string;

  /**
   * Pool `pg` ja existente, para o caso em que o chamador precisa do
   * driver cru alem do Prisma.
   *
   * O caminho de ingestao em massa usa `COPY`, que roda no driver `pg`
   * e nao no client gerado. Passar o mesmo pool aqui evita abrir um
   * segundo conjunto de conexoes contra o mesmo Postgres.
   */
  pool?: PgPool;

  /**
   * Niveis de log do Prisma. Padrao: apenas `warn` e `error`, porque
   * `query` em producao gera uma linha por consulta.
   */
  log?: Array<"query" | "info" | "warn" | "error">;
};

/**
 * Cria um `PrismaClient` novo, com pool proprio ou com o pool recebido.
 *
 * O Prisma 7 nao le mais a URL do `schema.prisma`: a conexao de runtime
 * entra obrigatoriamente por driver adapter.
 *
 * Cada chamada abre um pool novo quando `pool` nao e informado. Chamar
 * isto por requisicao esgota `max_connections` do Postgres — para o
 * caminho de leitura da API, use `getPrismaClient()`.
 */
export function createPrismaClient(
  options: PrismaClientOptions = {},
): PrismaClient {
  const { connectionString, pool, log = ["warn", "error"] } = options;

  if (pool !== undefined) {
    return new PrismaClient({ adapter: new PrismaPg(pool), log });
  }

  const connectionStringResolvida = connectionString ?? process.env.DATABASE_URL;
  if (connectionStringResolvida === undefined) {
    throw new Error(
      "informe `pool`, `connectionString` ou defina DATABASE_URL.",
    );
  }

  const poolProprio = new Pool({
    connectionString: connectionStringResolvida,
    max: tamanhoDoPool(),
  });
  return new PrismaClient({ adapter: new PrismaPg(poolProprio), log });
}

let sharedClient: PrismaClient | undefined;

/**
 * Client compartilhado do processo, criado na primeira chamada.
 *
 * Um pool por processo. `replicas x DATABASE_POOL_MAX` precisa caber no
 * `max_connections` do Postgres — esse e o teto que aparece antes da CPU.
 */
export function getPrismaClient(): PrismaClient {
  sharedClient ??= createPrismaClient();
  return sharedClient;
}

/**
 * Fecha o client compartilhado. Chamar no encerramento gracioso do
 * processo, depois de drenar o que esta em andamento.
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (sharedClient === undefined) {
    return;
  }
  const client = sharedClient;
  sharedClient = undefined;
  await client.$disconnect();
}
