"use client";

/**
 * GlobeView.tsx
 *
 * Main 3D globe component. It:
 * - Fetches crisis data from the API (lib/api.ts getGlobeCrises) using year/month from GlobeContext.
 * - Renders a globe.gl instance with: country outlines (GeoJSON), hex bin “bars” (from that data),
 *   an optional floating HTML label for a selected country, and optional comparison arcs.
 * - Listens to GlobeContext for: filters (year, month), viewMode (severity | funding-gap | anomalies),
 *   flyToCoordinates (camera), and comparisonData (arc source/target).
 * - Data flow: API → data (GlobeCountry[]) → hexBinPointsData (HexPoint[]) → hex layer; selectedPoint
 *   and comparisonData drive the label and arcs.
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------
// React hooks for state, memoization, effects, and DOM refs
import React, { useState, useMemo, useEffect, useRef } from "react";
// 3D globe library: Globe = constructor, GlobeInstance = type for the globe instance
import Globe, { GlobeInstance } from "globe.gl";
// Child components: camera/controls overlay and filter modal
import GlobeControls from "./GlobeControls";
// Global state: selected country, fly-to target, comparison arcs, view mode, filters
import { useGlobeContext } from "@/context/GlobeContext";
// API: fetches crisis data by year/month; GlobeCountry = shape of each country in the response
import { getGlobeCrises, GlobeCountry } from "@/lib/api";

// -----------------------------------------------------------------------------
// SEVERITY → COLOR MAPPING (used for hex bin bars and altitude)
// -----------------------------------------------------------------------------
// Maps severity band 1–5 to hex colors; used for both bar color and bar height
const SEVERITY_COLORS: Record<number, string> = {
  1: "#3b82f6", // blue   (lowest)
  2: "#22c55e", // green
  3: "#eab308", // yellow
  4: "#f97316", // orange
  5: "#ef4444", // red    (highest)
};

/** Clamps severity to 1–5 and returns the corresponding color from SEVERITY_COLORS. */
function severityColor(severityBand: number): string {
  const band = Math.min(5, Math.max(1, Math.round(severityBand)));
  return SEVERITY_COLORS[band] ?? SEVERITY_COLORS[1];
}

/**
 * From a hex bin’s aggregated data, returns a severity band 1–5 for color/altitude.
 * - If the bin has points: uses average severity of those points.
 * - Otherwise: approximates from sumWeight (used when globe.gl merges bins).
 */
function getSeverityBand(d: { points?: unknown[]; sumWeight: number }): number {
  const points = (d.points || []) as HexPoint[];
  if (points.length > 0) {
    const avg = points.reduce((s, p) => s + p.severity, 0) / points.length;
    return Math.min(5, Math.max(1, Math.round(avg)));
  }
  const approxSeverity = 1 + Math.min(4, d.sumWeight);
  return Math.min(5, Math.max(1, Math.round(approxSeverity)));
}

/**
 * Shape of one “point” fed to the hex bin layer. Built from GlobeCountry in useMemo below.
 * - lat, lng: position on globe
 * - pop: weight for binning (value depends on viewMode: severity, funding-gap, or anomalies)
 * - iso: country ISO3 code
 * - severity, fundingGap, anomalyScore: used for tooltips and for getSeverityBand when bins merge
 */
export type HexPoint = { lat: number; lng: number; pop: number; iso: string; severity: number; fundingGap: number; anomalyScore: number };

// -----------------------------------------------------------------------------
// GLOBE VIEW COMPONENT
// -----------------------------------------------------------------------------
export default function GlobeView() {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);   // DOM node that holds the canvas
  const globeRef = useRef<GlobeInstance | null>(null); // globe.gl instance for layers and camera

  // Local state
  const [selectedPoint, setSelectedPoint] = useState<GlobeCountry | null>(null); // Country used for the floating HTML label
  const [data, setData] = useState<GlobeCountry[]>([]);                            // Raw API response: list of countries with crises

  // From GlobeContext (see context/GlobeContext.tsx): drives fly-to, arcs, view mode, and filters
  const { selectedCountry, setSelectedCountry, flyToCoordinates, comparisonData, viewMode, filters } = useGlobeContext();

  // -------------------------------------------------------------------------
  // DATA FETCH: load crisis data when year/month filters change
  // -------------------------------------------------------------------------
  // Source: getGlobeCrises(year, month?) in lib/api.ts → returns { countries: GlobeCountry[] }
  // Receives: filters.year, filters.month from GlobeContext
  useEffect(() => {
    if (!filters.year) return;

    getGlobeCrises(filters.year, filters.month)
      .then((res) => {
        if (res && res.countries) {
          setData(res.countries);
        }
      })
      .catch((err) => console.error("Failed to load globe crises data:", err));
  }, [filters.year, filters.month]);

  // -------------------------------------------------------------------------
  // GLOBE INIT: create globe instance once, size to container, cleanup on unmount
  // -------------------------------------------------------------------------
  // Runs once on mount. Creates the 3D globe inside containerRef, sets textures and dimensions,
  // wires ResizeObserver so the globe resizes with the container.
  useEffect(() => {
    if (!containerRef.current) return;

    const globe = new Globe(containerRef.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight);

    globeRef.current = globe;

    const onResize = () => {
      if (!containerRef.current || !globeRef.current) return;
      globeRef.current.width(containerRef.current.clientWidth);
      globeRef.current.height(containerRef.current.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      globe._destructor?.();
    };
  }, []);

  // -------------------------------------------------------------------------
  // HEX BIN INPUT: convert API countries → flat array of HexPoints for the hex layer
  // -------------------------------------------------------------------------
  // Input: `data` (GlobeCountry[] from API), `viewMode` from GlobeContext.
  // Each GlobeCountry has: lat, lng, iso3, country_name, crises[] (each crisis has acaps_severity, funding_gap_usd, people_in_need, avg_b2b_ratio).
  // Output: one HexPoint per country. `pop` is the “weight” used for binning and varies by viewMode.
  const hexBinPointsData = useMemo((): HexPoint[] => {
    return data.map((country) => {
      let totalSeverity = 0;
      let totalFundingGap = 0;
      let totalPeopleInNeed = 0;
      let sumB2B = 0;
      let count = 0;

      country.crises?.forEach((crisis) => {
        totalSeverity += crisis.acaps_severity || 0;
        totalFundingGap += crisis.funding_gap_usd || 0;
        totalPeopleInNeed += crisis.people_in_need || 0;
        sumB2B += crisis.b2b_ratio || 0;
        count += 1;
      });

      const avgSeverity = count > 0 ? totalSeverity / count : 0;
      const fundingGap = totalFundingGap;
      const avgB2B = count > 0 ? sumB2B / count : 0;

      // `pop` = weight for hex bin aggregation. Which metric is used depends on viewMode from context.
      let pop = 0;
      if (count > 0) {
        if (viewMode === "severity") {
          pop = avgSeverity;
        } else if (viewMode === "funding-gap") {
          pop = Math.min(totalFundingGap / 1_000_000_000, 1.0);
        } else if (viewMode === "anomalies") {
          pop = Math.min(avgB2B / 100, 1.0);
        }
      }

      return {
        lat: country.lat,
        lng: country.lng,
        pop,
        iso: country.iso3,
        severity: avgSeverity,
        fundingGap,
        anomalyScore: avgB2B,
      };
    });
  }, [data, viewMode]);

  // -------------------------------------------------------------------------
  // GLOBE LAYERS: polygons (country borders), hex bins, HTML label, comparison arcs
  // -------------------------------------------------------------------------
  // Runs when data, hexBinPointsData, selectedPoint, comparisonData, or viewMode change.
  // All layer data is received from: (1) API → data, (2) derived hexBinPointsData, (3) GlobeContext (comparisonData), (4) local selectedPoint.
  useEffect(() => {
    if (!globeRef.current || !data.length) return;
    const globe = globeRef.current;

    // --- Country outlines (GeoJSON) ---
    // Fetched from external URL once; draws transparent polygons with white borders on the globe.
    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson').then(res => res.json()).then(countries => {
      globe
        .polygonsData(countries.features)
        .polygonCapColor(() => 'rgba(0, 0, 0, 0)')
        .polygonSideColor(() => 'rgba(255, 255, 255, 0.1)')
        .polygonStrokeColor(() => '#ffffff')
        .polygonAltitude(0.01);
    });

    // --- Hex bin layer (colored bars on the globe) ---
    // Data source: hexBinPointsData (one HexPoint per country, built from API data + viewMode).
    // globe.gl bins points by lat/lng, aggregates by "pop" weight; we color/height by severity via getSeverityBand.
    globe
      .heatmapsData([])
      .hexBinPointsData(hexBinPointsData)
      .hexBinPointLat("lat")
      .hexBinPointLng("lng")
      .hexBinPointWeight("pop")
      .hexAltitude((d) => (getSeverityBand(d) - 1) * 0.02 + 0.02)  // Bar height from severity 1–5
      .hexBinResolution(4)
      .hexTopColor((d) => severityColor(getSeverityBand(d)))
      .hexSideColor((d) => severityColor(getSeverityBand(d)))
      .hexBinMerge(true)
      .enablePointerInteraction(false);

    // --- Floating HTML label (tooltip for selected country) ---
    // Data source: selectedPoint (GlobeCountry | null). When set, one DOM label is shown at that country’s lat/lng.
    // Label content: country name, ISO3, crisis count, and “People in Need” from first crisis.
    globe
      .htmlElementsData(selectedPoint ? [selectedPoint] : [])
      .htmlLat((o) => (o as GlobeCountry).lat || 0)
      .htmlLng((o) => (o as GlobeCountry).lng || 0)
      .htmlAltitude(0.2)
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

    // --- Comparison arcs (source → target line) ---
    // Data source: comparisonData from GlobeContext (set elsewhere, e.g. when comparing two countries).
    // If present, one arc is drawn; otherwise arcs are cleared.
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
  }, [data, hexBinPointsData, selectedPoint, setSelectedCountry, comparisonData, viewMode]);

  // -------------------------------------------------------------------------
  // CAMERA: fly to coordinates when GlobeContext updates flyToCoordinates
  // -------------------------------------------------------------------------
  // Source: flyToCoordinates from GlobeContext (e.g. set when user picks “fly to” a country).
  // Animates the globe camera to the given lat/lng/altitude over 2 seconds.
  useEffect(() => {
    if (flyToCoordinates && globeRef.current) {
      globeRef.current.pointOfView(
        {
          lat: flyToCoordinates.lat,
          lng: flyToCoordinates.lng,
          altitude: flyToCoordinates.altitude ?? 1.5
        },
        2000
      );
    }
  }, [flyToCoordinates]);

  // -------------------------------------------------------------------------
  // RENDER: container, globe canvas, selected badge, controls, filters modal
  // -------------------------------------------------------------------------
  return (
    <div className="relative w-full h-screen">
      {/* DOM node that globe.gl mounts its canvas into */}
      <div ref={containerRef} className="w-full h-full" />
      {/* Badge showing currently selected country (from context); only visible when selectedCountry is set */}
      {selectedCountry && (
        <div className="absolute bottom-4 right-4 rounded bg-black/70 px-3 py-2 text-sm text-white">
          Selected: {selectedCountry}
        </div>
      )}
      {/* Camera controls (e.g. reset view) that need access to the globe instance */}
      <GlobeControls globeRef={globeRef} />
    </div>
  );
}
