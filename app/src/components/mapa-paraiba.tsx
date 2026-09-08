"use client";

import "leaflet/dist/leaflet.css";

import { MapContainer, TileLayer } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";

// Bounding box da Paraiba (SW, NE), com folga suficiente para o estado
// inteiro caber no enquadramento inicial do mapa.
const LIMITES_PARAIBA: LatLngBoundsExpression = [
  [-8.32, -38.8],
  [-6.0, -34.7],
];

export function MapaParaiba() {
  return (
    <MapContainer
      bounds={LIMITES_PARAIBA}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  );
}
