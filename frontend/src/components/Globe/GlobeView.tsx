"use client";

import { useEffect, useRef } from "react";
import Globe, { GlobeInstance } from "globe.gl";
// import { useGlobeData } from "@/hooks/useGlobeData";
// import { useAppStore } from "@/store/useAppStore";

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  // const { data, isLoading } = useGlobeData();
  // const { selectedCountry, setSelectedCountry, viewMode } = useAppStore();

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

  // Data layers — commented out for now (globe only)
  // useEffect(() => {
  //   if (!globeRef.current || !data) return;
  //   const globe = globeRef.current;
  //
  //   if (viewMode === "heatmap") {
  //     globe
  //       .hexBinPointsData(data)
  //       .hexBinPointLat((d: any) => d.lat)
  //       .hexBinPointLng((d: any) => d.lng)
  //       .hexBinPointWeight((d: any) => d.mismatch_score)
  //       .hexAltitude((d: any) => d.sumWeight * 0.01)
  //       .hexBinResolution(3)
  //       .hexTopColor((d: any) => mismatchColor(d.sumWeight / d.points.length))
  //       .hexSideColor((d: any) => mismatchColor(d.sumWeight / d.points.length));
  //   }
  //
  //   if (viewMode === "points") {
  //     globe
  //       .pointsData(data)
  //       .pointLat((d: any) => d.lat)
  //       .pointLng((d: any) => d.lng)
  //       .pointAltitude((d: any) => d.mismatch_score * 0.3)
  //       .pointRadius((d: any) => Math.sqrt(d.people_in_need) * 0.00001)
  //       .pointColor((d: any) => mismatchColor(d.mismatch_score))
  //       .onPointClick((point: any) => setSelectedCountry(point.iso3));
  //   }
  // }, [data, viewMode]);

  return <div ref={containerRef} className="w-full h-screen" />;
}

// function mismatchColor(score: number): string {
//   if (score > 0.5) return "rgba(220, 38, 38, 0.9)";   // deep red — severely underfunded
//   if (score > 0.2) return "rgba(249, 115, 22, 0.8)";   // orange — underfunded
//   if (score > -0.2) return "rgba(234, 179, 8, 0.7)";   // yellow — aligned
//   return "rgba(34, 197, 94, 0.7)";                       // green — well-funded
// }