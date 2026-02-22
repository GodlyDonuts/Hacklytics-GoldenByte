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

/**
 * Natural Earth ISO_A3 can be "-99" for disputed/unrecognised territories.
 * Prefer ISO_A3_EH, then ADM0_A3, as fallbacks.
 */
function resolveIso(props: Record<string, unknown>): string {
  const candidates = [
    props.ISO_A3 as string,
    props.ISO_A3_EH as string,
    props.ADM0_A3 as string,
  ];
  return candidates.find((c) => c && c !== "-99") ?? "-99";
}

function resolveName(props: Record<string, unknown>): string {
  return (
    (props.NAME as string) ||
    (props.ADMIN as string) ||
    (props.NAME_LONG as string) ||
    resolveIso(props)
  );
}

interface CrisisFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: Record<string, unknown>;
  __severity: number;
  __hasCrisis: boolean;
  __iso: string;   // resolved, never -99
  __name: string;
}

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const geoJsonRef = useRef<CrisisFeature[] | null>(null);

  const [data, setData] = useState<GlobeCountry[]>([]);
  const [geoReady, setGeoReady] = useState(false);
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);

  const { selectedCountry, isSpotlightActive, flyToCoordinates, comparisonData, viewMode, filters, setNearestSpotlightIso } =
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

  // When flyToCoordinates changes, find nearest crisis country to spotlight.
  // Only applied when isSpotlightActive is true (set false on reset_view).
  const nearestIso = useMemo(() => {
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

  // Spotlight: hover always takes priority; voice-nav spotlight only when explicitly active
  const spotlightIso = isSpotlightActive ? nearestIso : null;

  // Sync nearestIso into context so VoiceChatContext can use it for reports
  useEffect(() => {
    setNearestSpotlightIso(nearestIso);
  }, [nearestIso]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge GeoJSON features with crisis severity data.
  // Countries without real crisis data get a stable random low severity (1.0–1.5)
  // so they still render with a dim blue tint instead of being invisible.
  // Features whose ISO resolves to -99 (disputed/unrecognised territories) are dropped.
  const polygonFeatures = useMemo((): CrisisFeature[] => {
    if (!geoJsonRef.current) return [];
    return geoJsonRef.current
      .map((feat) => {
        const iso = resolveIso(feat.properties);
        if (iso === "-99") return null;  // drop unrecognised territories
        const name = resolveName(feat.properties);
        const metrics = countryMetrics.get(iso);
        if (metrics) {
          return { ...feat, __severity: metrics.severity, __hasCrisis: true, __iso: iso, __name: name };
        }
        // Stable hash so colour doesn't flicker on re-renders
        let hash = 0;
        for (let k = 0; k < iso.length; k++) hash = (hash * 31 + iso.charCodeAt(k)) >>> 0;
        const fakeSeverity = 1.0 + (hash % 100) / 200; // 1.0 – 1.5
        return { ...feat, __severity: fakeSeverity, __hasCrisis: false, __iso: iso, __name: name };
      })
      .filter((f): f is CrisisFeature => f !== null);
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
        if (!feat.__hasCrisis) {
          // Give non-crisis countries a visible raised base so they look 3D
          let hash = 0;
          for (let k = 0; k < feat.__iso.length; k++) hash = (hash * 31 + feat.__iso.charCodeAt(k)) >>> 0;
          return 0.04 + (hash % 100) / 5000; // ~0.04 – 0.06
        }
        if (spotlight && feat.__iso !== spotlight) return 0.04;
        return 0.02 + severityToT(feat.__severity) * 0.28;
      })
      .polygonCapColor((d) => {
        const feat = d as CrisisFeature;
        if (spotlight && feat.__iso !== spotlight) return DIMMED_CAP;
        if (!feat.__hasCrisis) {
          const [r, g, b] = sampleGradient(severityToT(feat.__severity));
          return `rgba(${r}, ${g}, ${b}, 0.55)`;
        }
        return capColor(feat.__severity);
      })
      .polygonSideColor((d) => {
        const feat = d as CrisisFeature;
        if (spotlight && feat.__iso !== spotlight) return DIMMED_SIDE;
        if (!feat.__hasCrisis) {
          const [r, g, b] = sampleGradient(severityToT(feat.__severity));
          return `rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, 0.08)`;
        }
        return sideColor(feat.__severity);
      })
      .polygonStrokeColor((d) => {
        const feat = d as CrisisFeature;
        if (spotlight && feat.__iso !== spotlight) return "rgba(255, 255, 255, 0.08)";
        return "rgba(255, 255, 255, 0.25)";
      })
      .polygonsTransitionDuration(300)
      .onPolygonHover((poly) => {
        if (!poly) {
          setHoveredIso(null);
          return;
        }
        const feat = poly as CrisisFeature;
        setHoveredIso(feat.__iso);
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
  }, [polygonFeatures, comparisonData, viewMode, spotlightIso, hoveredIso]);

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
    const feat = polygonFeatures.find((f) => f.__iso === hoveredIso);
    if (!feat) return null;
    const metrics = countryMetrics.get(hoveredIso);
    return {
      name: feat.__name,
      iso: feat.__iso,
      severity: metrics?.severity ?? null,  // null = no real crisis data
    };
  }, [hoveredIso, polygonFeatures, countryMetrics]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-[#0d0f12]/80 px-4 py-3 backdrop-blur-md"
        style={{ minWidth: 180 }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
          Legend
        </p>

        {/* Color gradient bar */}
        <div className="mb-1">
          <p className="text-[11px] text-white/70 mb-1 font-medium">Crisis Severity</p>
          <div
            className="h-3 w-full rounded-full"
            style={{
              background:
                "linear-gradient(to right, rgb(30,100,240), rgb(0,200,210), rgb(40,210,80), rgb(240,200,0), rgb(250,120,20), rgb(230,40,40))",
            }}
          />
          <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
            <span>1 – Low</span>
            <span>5 – Critical</span>
          </div>
        </div>

        {/* Height encoding */}
        <div className="mt-2 flex items-center gap-2">
          {/* Mini bar-height icon */}
          <div className="flex items-end gap-[3px] h-5">
            {[0.35, 0.55, 0.75, 1].map((h, i) => (
              <div
                key={i}
                className="w-[5px] rounded-sm"
                style={{
                  height: `${h * 100}%`,
                  background: `rgba(0,212,255,${0.4 + i * 0.15})`,
                }}
              />
            ))}
          </div>
          <p className="text-[11px] text-white/60">
            Bar height = severity
          </p>
        </div>
      </div>
      {/* Hovered country tooltip -- bottom right corner */}
      {hoveredInfo && (() => {
        const sev = hoveredInfo.severity;
        return (
          <div className="absolute bottom-4 right-4 rounded-lg border border-[#00d4ff]/30 bg-[#1a1d21]/90 px-4 py-3 text-sm text-white/90 backdrop-blur-sm">
            <div className="font-semibold text-[#00e5ff]">{hoveredInfo.name} ({hoveredInfo.iso})</div>
            <div className="text-xs text-white/60 mt-1">
              {sev !== null ? `Severity: ${sev.toFixed(1)}` : "No active crisis"}
            </div>
          </div>
        );
      })()}
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
