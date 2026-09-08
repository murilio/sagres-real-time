import { MapaParaiba } from "@/src/components/mapa-paraiba-loader";

export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
      }}
    >
      <header style={{ padding: "1rem 1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>
          Monitor SAGRES TCE-PB
        </h1>
        <p style={{ margin: 0, color: "GrayText" }}>
          Painel público sobre despesas, licitações, receitas e folha dos
          223 municípios da Paraíba.
        </p>
      </header>
      <div style={{ flex: 1 }}>
        <MapaParaiba />
      </div>
    </main>
  );
}
