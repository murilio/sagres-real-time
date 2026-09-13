import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, env } from "prisma/config";

// O CLI do Prisma 7 nao carrega o .env antes de avaliar este arquivo, e
// `env()` abaixo falha se a variavel nao existir. A carga e feita aqui,
// com `process.loadEnvFile` (nativo no Node 22, sem dependencia). Next.js
// tambem carrega `.env` sozinho em `next dev`/`next build`; isto cobre o
// CLI do Prisma, que roda fora do processo do Next.
const dotEnv = join(__dirname, ".env");
if (existsSync(dotEnv)) {
  process.loadEnvFile(dotEnv);
}

export default defineConfig({
  schema: join(__dirname, "prisma", "schema.prisma"),

  datasource: {
    // Usada apenas pelo CLI (migrate, introspect, studio). O runtime da
    // aplicacao nao passa por aqui: conecta pelo adapter em src/db.ts.
    //
    // DIRECT_URL (conexao direta, porta 5432) e obrigatoria aqui quando
    // DATABASE_URL aponta para um pooler em modo transaction (Supabase
    // pgbouncer, porta 6543): esse modo nao suporta os advisory locks e
    // DDL que `prisma migrate` precisa.
    url: env("DIRECT_URL"),
  },

  migrations: {
    path: join(__dirname, "prisma", "migrations"),

    // Roda em `prisma migrate reset`, para que resetar o banco nao deixe
    // a dimensao `municipios` vazia. Executa o fonte TypeScript direto
    // via `tsx`, sem passo de build — nao ha mais `dist/` a compilar.
    seed: "tsx src/seed/municipios.ts",
  },
});
