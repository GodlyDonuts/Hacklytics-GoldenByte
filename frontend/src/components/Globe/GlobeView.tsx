"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Globe, { GlobeInstance } from "globe.gl";
import GlobeControls from "./GlobeControls";

type MismatchPoint = {
  lat: number;
  lng: number;
  mismatch_score: number;
  people_in_need: number;
  iso3: string;
};

// Mock data for testing without backend
const MOCK_DATA: MismatchPoint[] = [
  { lat: 15.5, lng: 32.5, mismatch_score: 0.1, people_in_need: 15_000_000, iso3: "SDN" },
  { lat: 15.3, lng: 44.2, mismatch_score: 0.72, people_in_need: 21_000_000, iso3: "YEM" },
  { lat: 36.1, lng: 43.9, mismatch_score: 0.65, people_in_need: 12_000_000, iso3: "IRQ" },
  { lat: 33.9, lng: 35.5, mismatch_score: 0.58, people_in_need: 2_500_000, iso3: "LBN" },
  { lat: 34.8, lng: 38.9, mismatch_score: 0.91, people_in_need: 14_000_000, iso3: "SYR" },
  { lat: 4.6, lng: 33.5, mismatch_score: 0.45, people_in_need: 9_000_000, iso3: "SSD" },
  { lat: 34.0, lng: 66.0, mismatch_score: 0.78, people_in_need: 28_000_000, iso3: "AFG" },
  { lat: 6.5, lng: 3.4, mismatch_score: 0.35, people_in_need: 3_000_000, iso3: "NGA" },
  { lat: -1.3, lng: 36.8, mismatch_score: 0.52, people_in_need: 5_500_000, iso3: "KEN" },
  { lat: 12.8, lng: 45.0, mismatch_score: 0.68, people_in_need: 4_000_000, iso3: "SOM" },
];

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MismatchPoint | null>(null);

  const data = useMemo(() => MOCK_DATA, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const globe = new Globe(containerRef.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight);

    globeRef.current = globe;

    return () => { globe._destructor?.(); };
  }, []);

  const heatmapData = useMemo(
    () => [data.map((d) => ({ lat: d.lat, lng: d.lng, weight: d.mismatch_score }))],
    [data]
  );

  useEffect(() => {
    if (!globeRef.current || !data.length) return;
    const globe = globeRef.current;

    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson').then(res => res.json()).then(countries => {
      globe
        .polygonsData(countries.features)
        .polygonCapColor(() => 'rgba(0, 0, 0, 0)') // Transparent surface
        .polygonSideColor(() => 'rgba(255, 255, 255, 0.1)') // Transparent sides
        .polygonStrokeColor(() => '#ffffff')      // White border lines
        .polygonAltitude(0.01)                     // Slightly above globe surface
        // .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg');
    });

    globe
      .heatmapsData(heatmapData)
      .heatmapPointLat("lat")
      .heatmapPointLng("lng")
      .heatmapPointWeight("weight")
      .heatmapBaseAltitude(0)
      .heatmapBandwidth(0.5)
      .heatmapTopAltitude(0.7)
      .heatmapsTransitionDuration(3000)
      .enablePointerInteraction(true)
      .onHeatmapClick((_heatmap, _event, coords) => {
        const p = nearestPoint(data, coords.lat, coords.lng);
        setSelectedCountry(p.iso3);
        setSelectedPoint(p);
      });

    globe
      .htmlElementsData(selectedPoint ? [selectedPoint] : [])
      .htmlLat((o) => (o as MismatchPoint).lat)
      .htmlLng((o) => (o as MismatchPoint).lng)
      .htmlAltitude((o) => (o as MismatchPoint).mismatch_score)
      .htmlElement((obj) => {
        const p = obj as MismatchPoint;
        const el = document.createElement("div");
        el.className = "point-label";
        el.innerHTML = `
          <div><strong>${p.iso3}</strong></div>
          <div>lat: ${p.lat.toFixed(4)}</div>
          <div>lng: ${p.lng.toFixed(4)}</div>
          <div>mismatch: ${p.mismatch_score.toFixed(3)}</div>
          <div>people in need: ${(p.people_in_need / 1_000_000).toFixed(1)}M</div>
        `;
        return el;
      })
      .htmlElementVisibilityModifier((el, isVisible) => {
        (el as HTMLElement).style.opacity = isVisible ? "1" : "0";
      });
  }, [data, heatmapData, selectedPoint]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />
      {selectedCountry && (
        <div className="absolute bottom-4 right-4 rounded bg-black/70 px-3 py-2 text-sm text-white">
          Selected: {selectedCountry}
        </div>
      )}
      <GlobeControls globeRef={globeRef} />
    </div>
  );
}

function nearestPoint(data: MismatchPoint[], lat: number, lng: number): MismatchPoint {
  let best = data[0];
  let bestD = Infinity;
  for (const p of data) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
