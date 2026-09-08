"use client";

import dynamic from "next/dynamic";

// `ssr: false` em `next/dynamic` só é permitido dentro de um Client
// Component — daí este arquivo existir só para isolar o dynamic import
// do Server Component em app/page.tsx.
export const MapaParaiba = dynamic(
  () => import("./mapa-paraiba").then((m) => m.MapaParaiba),
  { ssr: false },
);
