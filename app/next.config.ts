import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O Next.js 16 gera AGENTS.md e CLAUDE.md dentro de `app/` a cada
  // `next dev`. O CLAUDE.md real do projeto vive na raiz do
  // repositorio (convencoes deste repo, nao do Next.js); o gerado
  // colidiria com ele para qualquer ferramenta que resolva o arquivo
  // mais proximo do diretorio de trabalho.
  agentRules: false,
};

export default nextConfig;
