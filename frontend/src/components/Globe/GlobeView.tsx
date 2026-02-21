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
  const [viewMode, setViewMode] = useState<"heatmap" | "points">("points");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

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

    if (viewMode === "heatmap") {
      globe
        .heatmapsData(heatmapData)
        .heatmapPointLat("lat")
        .heatmapPointLng("lng")
        .heatmapPointWeight("weight")
        .heatmapTopAltitude(0.7)
        .heatmapsTransitionDuration(3000)
        .enablePointerInteraction(false);
      globe.pointsData([]);
    }

    if (viewMode === "points") {
      const d = (o: object) => o as MismatchPoint;
      globe
        .pointsData(data)
        .pointLat((o) => d(o).lat)
        .pointLng((o) => d(o).lng)
        .pointAltitude((o) => d(o).mismatch_score * 0.3)
        .pointRadius((o) => Math.max(0.15, Math.sqrt(d(o).people_in_need) * 0.00001))
        .pointColor((o) => mismatchColor(d(o).mismatch_score))
        .onPointClick((point) => setSelectedCountry((point as MismatchPoint).iso3));
      globe.heatmapsData([]);
    }
  }, [data, viewMode, heatmapData]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode("points")}
          className={`rounded px-3 py-1.5 text-sm ${viewMode === "points" ? "bg-blue-600 text-white" : "bg-black/50 text-white/80 hover:bg-white/10"}`}
        >
          Points
        </button>
        <button
          type="button"
          onClick={() => setViewMode("heatmap")}
          className={`rounded px-3 py-1.5 text-sm ${viewMode === "heatmap" ? "bg-blue-600 text-white" : "bg-black/50 text-white/80 hover:bg-white/10"}`}
        >
          Heatmap
        </button>
      </div>
      {selectedCountry && (
        <div className="absolute bottom-4 right-4 rounded bg-black/70 px-3 py-2 text-sm text-white">
          Selected: {selectedCountry}
        </div>
      )}
      <GlobeControls globeRef={globeRef} />
    </div>
  );
}

function mismatchColor(score: number): string {
  if (score > 0.5) return "rgba(220, 38, 38, 0.9)";   // deep red — severely underfunded
  if (score > 0.2) return "rgba(249, 115, 22, 0.8)";   // orange — underfunded
  if (score > -0.2) return "rgba(234, 179, 8, 0.7)";   // yellow — aligned
  return "rgba(34, 197, 94, 0.7)";                       // green — well-funded
}
