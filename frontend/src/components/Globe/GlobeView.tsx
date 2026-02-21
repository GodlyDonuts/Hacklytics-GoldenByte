"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Globe, { GlobeInstance } from "globe.gl";
import GlobeControls from "./GlobeControls";
import { useGlobeContext } from "@/context/GlobeContext";


import { getGlobeCrises, GlobeCountry } from "@/lib/api";

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<GlobeCountry | null>(null);
  const { selectedCountry, setSelectedCountry, flyToCoordinates, comparisonData, viewMode, filters } = useGlobeContext();
  const [data, setData] = useState<GlobeCountry[]>([]);

  useEffect(() => {
    // Only fetch if a year filter exists
    if (!filters.year) return;

    getGlobeCrises(filters.year)
      .then((res) => {
        if (res && res.countries) {
          setData(res.countries);
        }
      })
      .catch((err) => console.error("Failed to load globe crises data:", err));
  }, [filters.year]);

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

  const heatmapData = useMemo(() => {
    return [data.map((country) => {
      // Aggregate crisis data for the country to get a single weight
      let weight = 0;

      let totalSeverity = 0;
      let totalFundingGap = 0;
      let totalPeopleInNeed = 0;
      let count = 0;

      country.crises?.forEach(crisis => {
        totalSeverity += crisis.acaps_severity || 0;
        totalFundingGap += crisis.funding_gap_usd || 0;
        totalPeopleInNeed += crisis.people_in_need || 0;
        count += 1;
      });

      if (count === 0) return { lat: country.lat, lng: country.lng, weight: 0, iso: country.iso3 };

      if (viewMode === 'severity') {
        // Map total people in need to 0-1 scale, capped at 30M for visual max
        weight = Math.min(totalPeopleInNeed / 30_000_000, 1.0);
      } else if (viewMode === 'funding-gap') {
        // Map funding gap USD to 0-1 scale, capped at $1B for visual max
        weight = Math.min(totalFundingGap / 1_000_000_000, 1.0);
      } else if (viewMode === 'anomalies') {
        // Placeholder anomalies metric: e.g. High avg B2B ratio
        let sumB2B = 0;
        country.crises?.forEach(c => sumB2B += c.avg_b2b_ratio || 0);
        let avgB2B = count > 0 ? sumB2B / count : 0;
        weight = Math.min(avgB2B / 100, 1.0); // Assuming ratio as percentage up to 100
      }

      return { lat: country.lat, lng: country.lng, weight, iso: country.iso3 };
    })];
  }, [data, viewMode]);

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
        if (p && p.iso3) {
          setSelectedCountry(p.iso3);
          setSelectedPoint(p);
        }
      });

    globe
      .htmlElementsData(selectedPoint ? [selectedPoint] : [])
      .htmlLat((o) => (o as GlobeCountry).lat || 0)
      .htmlLng((o) => (o as GlobeCountry).lng || 0)
      .htmlAltitude(0.2) // Fixed altitude or calculate based on aggregated severity
      .htmlElement((obj) => {
        const country = obj as GlobeCountry;

        let targetCrisis = country.crises && country.crises.length > 0 ? country.crises[0] : null;
        let pin = targetCrisis ? (targetCrisis.people_in_need / 1_000_000) : 0;
        let pinDisplay = pin > 0 ? `${pin.toFixed(1)}M` : 'Unknown';

        const el = document.createElement("div");
        el.className = "point-label";
        el.innerHTML = `
          <div><strong>${country.country_name} (${country.iso3})</strong></div>
          <div>Crises: ${country.crises?.length || 0}</div>
          <div>People in Need: ${pinDisplay}</div>
        `;
        return el;
      })
      .htmlElementVisibilityModifier((el, isVisible) => {
        (el as HTMLElement).style.opacity = isVisible ? "1" : "0";
      });

    // Configure Comparison Arcs
    if (comparisonData) {
      globe
        .arcsData([
          {
            startLat: comparisonData.sourceLat,
            startLng: comparisonData.sourceLng,
            endLat: comparisonData.targetLat,
            endLng: comparisonData.targetLng,
            color: ['#00FF88', '#00DDFF']
          }
        ])
        .arcStartLat(d => (d as any).startLat)
        .arcStartLng(d => (d as any).startLng)
        .arcEndLat(d => (d as any).endLat)
        .arcEndLng((d: any) => d.endLng)
        .arcColor((d: any) => d.color)
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashInitialGap(() => Math.random())
        .arcDashAnimateTime(1500)
        .arcAltitude(0.5);
    } else {
      globe.arcsData([]);
    }
  }, [data, heatmapData, selectedPoint, setSelectedCountry, comparisonData]);

  // Handle flyToCoordinates changes
  useEffect(() => {
    if (flyToCoordinates && globeRef.current) {
      globeRef.current.pointOfView(
        {
          lat: flyToCoordinates.lat,
          lng: flyToCoordinates.lng,
          altitude: flyToCoordinates.altitude ?? 1.5
        },
        2000 // Transition duration in ms
      );
    }
  }, [flyToCoordinates]);

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

function nearestPoint(data: GlobeCountry[], lat: number, lng: number): GlobeCountry {
  if (data.length === 0) return {} as GlobeCountry;
  let best = data[0];
  let bestD = Infinity;
  for (const country of data) {
    const plat = country.lat || 0;
    const plng = country.lng || 0;
    const d = (plat - lat) ** 2 + (plng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = country;
    }
  }
  return best;
}
