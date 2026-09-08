"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import type { LatLngBoundsExpression, PathOptions } from "leaflet";

// Bounding box da Paraiba (SW, NE), com folga suficiente para o estado
// inteiro caber no enquadramento inicial do mapa.
const LIMITES_PARAIBA: LatLngBoundsExpression = [
  [-8.32, -38.8],
  [-6.0, -34.7],
];

// Servido como asset estatico de `public/geo/`, gerado por
// `pnpm geo:baixar` (src/scripts/baixar-contornos-municipios.ts) a
// partir da malha territorial do IBGE. Nao e buscado do IBGE em tempo
// de requisicao — o arquivo e versionado no repositorio.
const URL_CONTORNOS = "/geo/paraiba-municipios.geojson";

type PropriedadesContorno =
  | { tipo: "estado"; codigo_uf: string; nome: string }
  | { tipo: "municipio"; codigo_tce: string; codigo_ibge: string; nome: string };

function estiloContorno(
  feature?: GeoJSON.Feature<GeoJSON.Geometry, PropriedadesContorno>,
): PathOptions {
  if (feature?.properties.tipo === "estado") {
    return { color: "#1d4ed8", weight: 2, fill: false };
  }
  // Sem preenchimento por enquanto: colorir por indicador (mapa
  // coropletico) e o proximo passo natural, quando houver dado de
  // fiscalizacao por municipio para mapear em cor.
  return { color: "#64748b", weight: 1, fillOpacity: 0 };
}

export function MapaParaiba() {
  const [contornos, setContornos] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(URL_CONTORNOS)
      .then((resposta) => resposta.json())
      .then((dados: GeoJsonObject) => {
        if (!cancelado) {
          setContornos(dados);
        }
      })
      .catch((erro: unknown) => {
        console.error("mapa-paraiba: falha ao carregar contornos", erro);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <MapContainer
      bounds={LIMITES_PARAIBA}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> — contornos: <a href="https://servicodados.ibge.gov.br/api/docs/malhas">IBGE</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {contornos !== null && (
        <GeoJSON
          key="contornos-paraiba"
          data={contornos}
          style={estiloContorno as (feature?: GeoJSON.Feature) => PathOptions}
        />
      )}
    </MapContainer>
  );
}
