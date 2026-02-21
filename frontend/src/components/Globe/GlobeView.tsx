"use client";

/**
 * GlobeView.tsx
 *
 * Main 3D globe component rendering crisis data as raised country polygons.
 * Countries are elevated proportional to average crisis severity (polygon altitude),
 * colored by a continuous gradient, with atmosphere glow and smooth transitions.
 *
 * Hover over a country to spotlight it (flatten/dim all others).
 * Voice agent fly-to also spotlights the nearest country.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import Globe, { GlobeInstance } from "globe.gl";
import GlobeControls from "./GlobeControls";
import { useGlobeContext } from "@/context/GlobeContext";
import { getGlobeCrises, GlobeCountry } from "@/lib/api";

// Continuous color gradient stops: severity 1-5 mapped linearly to 0-1.
const COLOR_STOPS: [number, number, number, number][] = [
  [0.0, 30, 100, 240],   // deep blue (severity 1)
  [0.2, 0, 200, 210],    // cyan-teal
  [0.4, 40, 210, 80],    // green
  [0.6, 240, 200, 0],    // yellow
  [0.8, 250, 120, 20],   // orange
  [1.0, 230, 40, 40],    // red (severity 5)
];

const NEUTRAL_CAP = "rgba(255, 255, 255, 0.03)";
const NEUTRAL_SIDE = "rgba(255, 255, 255, 0.02)";
const DIMMED_CAP = "rgba(255, 255, 255, 0.06)";
const DIMMED_SIDE = "rgba(255, 255, 255, 0.03)";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson";

function severityToT(severity: number): number {
  return Math.min(1, Math.max(0, (severity - 1) / 4));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleGradient(t: number): [number, number, number] {
  const tc = Math.min(1, Math.max(0, t));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [pos0, r0, g0, b0] = COLOR_STOPS[i];
    const [pos1, r1, g1, b1] = COLOR_STOPS[i + 1];
    if (tc >= pos0 && tc <= pos1) {
      const local = (tc - pos0) / (pos1 - pos0);
      return [
        Math.round(lerp(r0, r1, local)),
        Math.round(lerp(g0, g1, local)),
        Math.round(lerp(b0, b1, local)),
      ];
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  return [last[1], last[2], last[3]];
}

function capColor(severity: number): string {
  const [r, g, b] = sampleGradient(severityToT(severity));
  return `rgba(${r}, ${g}, ${b}, 0.75)`;
}

function sideColor(severity: number): string {
  const [r, g, b] = sampleGradient(severityToT(severity));
  return `rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, 0.2)`;
}

interface CrisisFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: Record<string, unknown>;
  __severity: number;
  __hasCrisis: boolean;
}

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const geoJsonRef = useRef<CrisisFeature[] | null>(null);

  const [data, setData] = useState<GlobeCountry[]>([]);
  const [geoReady, setGeoReady] = useState(false);
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);

  const { selectedCountry, flyToCoordinates, comparisonData, viewMode, filters } =
    useGlobeContext();

  // Fetch crisis data when year/month filters change
  useEffect(() => {
    if (!filters.year) return;
    getGlobeCrises(filters.year, filters.month)
      .then((res) => {
        setData(res && res.countries ? res.countries : []);
      })
      .catch((err) => console.error("Failed to load globe crises data:", err));
  }, [filters.year, filters.month]);

  // Fetch GeoJSON country shapes once
  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((res) => res.json())
      .then((geo) => {
        geoJsonRef.current = geo.features as CrisisFeature[];
        setGeoReady(true);
      })
      .catch((err) => console.error("Failed to load GeoJSON:", err));
  }, []);

  // Build lookup from iso3 -> { severity, lat, lng }
  const countryMetrics = useMemo(() => {
    const map = new Map<string, { severity: number; lat: number; lng: number }>();
    for (const country of data) {
      let totalSeverity = 0;
      let count = 0;
      country.crises?.forEach((c) => {
        totalSeverity += c.acaps_severity || 0;
        count += 1;
      });
      if (count > 0) {
        map.set(country.iso3, {
          severity: totalSeverity / count,
          lat: country.lat,
          lng: country.lng,
        });
      }
    }
    return map;
  }, [data]);

  // When flyToCoordinates is set, find the nearest country ISO to spotlight
  const spotlightIso = useMemo(() => {
    if (!flyToCoordinates) return null;
    let bestIso: string | null = null;
    let bestDist = Infinity;
    for (const [iso, m] of countryMetrics) {
      const dLat = m.lat - flyToCoordinates.lat;
      const dLng = m.lng - flyToCoordinates.lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        bestIso = iso;
      }
    }
    return bestIso;
  }, [flyToCoordinates, countryMetrics]);

  // Merge GeoJSON features with crisis severity data
  const polygonFeatures = useMemo((): CrisisFeature[] => {
    if (!geoJsonRef.current) return [];
    return geoJsonRef.current.map((feat) => {
      const iso = feat.properties.ISO_A3 as string;
      const metrics = countryMetrics.get(iso);
      return {
        ...feat,
        __severity: metrics?.severity ?? 0,
        __hasCrisis: metrics !== undefined,
      };
    });
  }, [countryMetrics, geoReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Globe init
  useEffect(() => {
    if (!containerRef.current) return;

    const globe = new Globe(containerRef.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor("#00d4ff")
      .atmosphereAltitude(0.18)
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

  // Update polygon layers
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (polygonFeatures.length === 0) {
      globe.polygonsData([]);
      globe.arcsData([]);
      return;
    }

    // Hover takes priority over voice-agent spotlight
    const spotlight = hoveredIso ?? spotlightIso;

    globe
      .polygonsData(polygonFeatures)
      .polygonAltitude((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (!feat.__hasCrisis) return 0.005;
        if (spotlight && iso !== spotlight) return 0.005;
        return 0.02 + severityToT(feat.__severity) * 0.28;
      })
      .polygonCapColor((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (!feat.__hasCrisis) return NEUTRAL_CAP;
        if (spotlight && iso !== spotlight) return DIMMED_CAP;
        return capColor(feat.__severity);
      })
      .polygonSideColor((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (!feat.__hasCrisis) return NEUTRAL_SIDE;
        if (spotlight && iso !== spotlight) return DIMMED_SIDE;
        return sideColor(feat.__severity);
      })
      .polygonStrokeColor((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (spotlight && iso !== spotlight) return "rgba(255, 255, 255, 0.08)";
        return "rgba(255, 255, 255, 0.25)";
      })
      .polygonsTransitionDuration(300)
      .onPolygonHover((poly) => {
        if (!poly) {
          setHoveredIso(null);
          return;
        }
        const feat = poly as CrisisFeature;
        if (feat.__hasCrisis) {
          setHoveredIso(feat.properties.ISO_A3 as string);
        } else {
          setHoveredIso(null);
        }
      })
      .polygonLabel(() => "")
      .enablePointerInteraction(true);

    // Comparison arcs
    if (comparisonData) {
      globe
        .arcsData([
          {
            startLat: comparisonData.sourceLat,
            startLng: comparisonData.sourceLng,
            endLat: comparisonData.targetLat,
            endLng: comparisonData.targetLng,
            color: ["#00FF88", "#00DDFF"],
          },
        ])
        .arcStartLat((d) => (d as any).startLat)
        .arcStartLng((d) => (d as any).startLng)
        .arcEndLat((d) => (d as any).endLat)
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
  }, [polygonFeatures, comparisonData, viewMode, spotlightIso, hoveredIso, countryMetrics]);

  // Camera: fly to coordinates from context
  useEffect(() => {
    if (flyToCoordinates && globeRef.current) {
      globeRef.current.pointOfView(
        {
          lat: flyToCoordinates.lat,
          lng: flyToCoordinates.lng,
          altitude: flyToCoordinates.altitude ?? 1.5,
        },
        2000
      );
    }
  }, [flyToCoordinates]);

  // Look up hovered country info for the tooltip
  const hoveredInfo = useMemo(() => {
    if (!hoveredIso) return null;
    const feat = polygonFeatures.find((f) => f.properties.ISO_A3 === hoveredIso);
    if (!feat || !feat.__hasCrisis) return null;
    const metrics = countryMetrics.get(hoveredIso);
    return {
      name: (feat.properties.NAME as string) ?? hoveredIso,
      iso: hoveredIso,
      severity: metrics?.severity ?? 0,
    };
  }, [hoveredIso, polygonFeatures, countryMetrics]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />
      {/* Hovered country tooltip -- bottom right corner */}
      {hoveredInfo && (
        <div className="absolute bottom-4 right-4 rounded-lg border border-[#00d4ff]/30 bg-[#1a1d21]/90 px-4 py-3 text-sm text-white/90 backdrop-blur-sm">
          <div className="font-semibold text-[#00e5ff]">{hoveredInfo.name} ({hoveredInfo.iso})</div>
          <div className="text-xs text-white/60 mt-1">Severity: {hoveredInfo.severity.toFixed(1)}</div>
        </div>
      )}
      {/* Selected country badge (from voice agent) */}
      {selectedCountry && !hoveredInfo && (
        <div className="absolute bottom-4 right-4 rounded-lg border border-[#00d4ff]/30 bg-[#1a1d21]/90 px-4 py-3 text-sm text-white/90 backdrop-blur-sm">
          Selected: {selectedCountry}
        </div>
      )}
      <GlobeControls globeRef={globeRef} />
    </div>
  );
}
