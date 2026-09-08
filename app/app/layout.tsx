import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitor SAGRES TCE-PB",
  description:
    "Painel publico sobre os dados abertos de despesas, licitacoes, receitas e folha dos municipios da Paraiba",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
