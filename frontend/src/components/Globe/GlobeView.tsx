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
import GenieChartPanel from "./GenieChartPanel";
import CountryDetailOverlay from "./CountryDetailOverlay";
import AgentActivityFeed from "./AgentActivityFeed";
import { useGlobeContext, type PredictiveRisk } from "@/context/GlobeContext";
import { getGlobeCrises, GlobeCountry, getPredictiveRisks, type Crisis } from "@/lib/api";

// Color gradient stops per view mode. Each maps a 0-1 range to RGB.
const SEVERITY_STOPS: [number, number, number, number][] = [
  [0.0, 30, 100, 240],   // deep blue (low)
  [0.2, 0, 200, 210],    // cyan-teal
  [0.4, 40, 210, 80],    // green
  [0.6, 240, 200, 0],    // yellow
  [0.8, 250, 120, 20],   // orange
  [1.0, 230, 40, 40],    // red (high)
];

const FUNDING_GAP_STOPS: [number, number, number, number][] = [
  [0.0, 40, 180, 80],    // green (small gap)
  [0.3, 200, 200, 40],   // yellow
  [0.6, 230, 130, 20],   // orange
  [1.0, 200, 30, 30],    // red (large gap)
];

const OVERSIGHT_STOPS: [number, number, number, number][] = [
  [0.0, 60, 60, 100],    // muted blue-grey (well-covered)
  [0.3, 120, 50, 180],   // purple
  [0.6, 200, 40, 160],   // magenta
  [1.0, 255, 60, 60],    // bright red (most overlooked)
];

type ColorStops = [number, number, number, number][];
const COLOR_STOPS: Record<string, ColorStops> = {
  severity: SEVERITY_STOPS,
  "funding-gap": FUNDING_GAP_STOPS,
  anomalies: OVERSIGHT_STOPS,
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const NEUTRAL_CAP = "rgba(255, 255, 255, 0.03)";
const NEUTRAL_SIDE = "rgba(255, 255, 255, 0.02)";
const DIMMED_CAP = "rgba(255, 255, 255, 0.06)";
const DIMMED_SIDE = "rgba(255, 255, 255, 0.03)";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson";

function formatCompact(v: number | null | undefined): string {
  if (v === null || v === undefined) return "--";
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function severityToT(severity: number): number {
  return Math.min(1, Math.max(0, (severity - 1) / 4));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleGradient(t: number, stops: ColorStops): [number, number, number] {
  const tc = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [pos0, r0, g0, b0] = stops[i];
    const [pos1, r1, g1, b1] = stops[i + 1];
    if (tc >= pos0 && tc <= pos1) {
      const local = (tc - pos0) / (pos1 - pos0);
      return [
        Math.round(lerp(r0, r1, local)),
        Math.round(lerp(g0, g1, local)),
        Math.round(lerp(b0, b1, local)),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

function capColorForMode(t: number, mode: string): string {
  const stops = COLOR_STOPS[mode] ?? SEVERITY_STOPS;
  const [r, g, b] = sampleGradient(t, stops);
  return `rgba(${r}, ${g}, ${b}, 0.75)`;
}

function sideColorForMode(t: number, mode: string): string {
  const stops = COLOR_STOPS[mode] ?? SEVERITY_STOPS;
  const [r, g, b] = sampleGradient(t, stops);
  return `rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, 0.2)`;
}

interface CrisisFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: Record<string, unknown>;
  __severity: number;
  __fundingGapNorm: number;   // 0-1 normalized funding gap
  __oversightScore: number;   // 0-1 oversight (higher = more overlooked)
  __hasCrisis: boolean;
}

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const geoJsonRef = useRef<CrisisFeature[] | null>(null);

  const [data, setData] = useState<GlobeCountry[]>([]);
  const [geoReady, setGeoReady] = useState(false);
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);

  const { selectedCountry, setSelectedCountry, flyToCoordinates, comparisonData, viewMode, filters, setFilters, predictiveRisks, setPredictiveRisks } =
    useGlobeContext();

  const [loadingRisks, setLoadingRisks] = useState(false);

  // Fetch predictive risks when mode is activated
  useEffect(() => {
    if (viewMode === "predictive-risks" && !predictiveRisks && !loadingRisks) {
      setLoadingRisks(true);
      getPredictiveRisks()
        .then((res) => {
          setPredictiveRisks(res.risks);
        })
        .catch((err) => console.error("Failed to load predictive risks:", err))
        .finally(() => setLoadingRisks(false));
    }
  }, [viewMode, predictiveRisks, setPredictiveRisks, loadingRisks]);

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

  // Build lookup from iso3 -> per-mode metrics
  const countryMetrics = useMemo(() => {
    const map = new Map<string, {
      severity: number;
      fundingGap: number;
      oversightScore: number;
      lat: number;
      lng: number;
    }>();
    for (const country of data) {
      const crises = country.crises ?? [];
      if (crises.length === 0) continue;
      let totalSeverity = 0;
      let totalOversight = 0;
      let totalCoverageRatio = 0;
      for (const c of crises) {
        totalSeverity += c.acaps_severity ?? 0;
        totalOversight += c.oversight_score ?? 0;
        totalCoverageRatio += c.coverage_ratio ?? 1;
      }
      const avgCoverage = totalCoverageRatio / crises.length;
      map.set(country.iso3, {
        severity: totalSeverity / crises.length,
        fundingGap: Math.min(1, Math.max(0, 1 - avgCoverage)),  // 0 = fully funded, 1 = no funding
        oversightScore: totalOversight / crises.length,  // already 0-1 from backend
        lat: country.lat,
        lng: country.lng,
      });
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

  // Merge GeoJSON features with all crisis metrics
  const polygonFeatures = useMemo((): CrisisFeature[] => {
    if (!geoJsonRef.current) return [];
    return geoJsonRef.current.map((feat) => {
      const iso = feat.properties.ISO_A3 as string;
      const metrics = countryMetrics.get(iso);
      const hasRealCrisis = metrics !== undefined;

      return {
        ...feat,
        __severity: metrics?.severity ?? 1,
        __fundingGapNorm: metrics?.fundingGap ?? 0,
        __oversightScore: metrics?.oversightScore ?? 0,
        __hasCrisis: true,
      };
    });
  }, [countryMetrics, geoReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Globe init
  useEffect(() => {
    if (!containerRef.current) return;

    const globe = new Globe(containerRef.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundColor("#080c12")
      .showAtmosphere(true)
      .atmosphereColor("#00d4ff")
      .atmosphereAltitude(0.18)
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight)
      .pointOfView({ lat: 20, lng: 0, altitude: 3.2 });

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

  // Update polygon layers and atmosphere
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (polygonFeatures.length === 0) {
      globe.polygonsData([]);
      globe.arcsData([]);
      globe.atmosphereColor("#00d4ff");
      return;
    }

    // Hover takes priority, then selected country, then voice-agent spotlight
    const spotlight = hoveredIso ?? selectedCountry ?? spotlightIso;

    // Select the metric value (0-1) based on current view mode
    const metricForMode = (feat: CrisisFeature): number => {
      switch (viewMode) {
        case "funding-gap":
          return feat.__fundingGapNorm;
        case "anomalies":
          return feat.__oversightScore;
        default: // severity
          return severityToT(feat.__severity);
      }
    };

    // Update Atmosphere Color based on Spotlight
    if (spotlight) {
      const spotlightFeat = polygonFeatures.find(f => f.properties.ISO_A3 === spotlight);
      if (spotlightFeat && spotlightFeat.__hasCrisis) {
        const t = metricForMode(spotlightFeat);
        const stops = COLOR_STOPS[viewMode] ?? SEVERITY_STOPS;
        const [r, g, b] = sampleGradient(t, stops);
        // Use a slightly more vibrant version for the atmosphere
        globe.atmosphereColor(`rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`);
      } else {
        globe.atmosphereColor("#00d4ff");
      }
    } else {
      globe.atmosphereColor("#00d4ff");
    }

    globe
      .polygonsData(polygonFeatures)
      .polygonAltitude((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (!feat.__hasCrisis) return 0.005;
        if (spotlight && iso !== spotlight) return 0.005;
        return 0.02 + metricForMode(feat) * 0.28;
      })
      .polygonCapColor((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (!feat.__hasCrisis) return NEUTRAL_CAP;
        if (spotlight && iso !== spotlight) return DIMMED_CAP;
        return capColorForMode(metricForMode(feat), viewMode);
      })
      .polygonSideColor((d) => {
        const feat = d as CrisisFeature;
        const iso = feat.properties.ISO_A3 as string;
        if (!feat.__hasCrisis) return NEUTRAL_SIDE;
        if (spotlight && iso !== spotlight) return DIMMED_SIDE;
        return sideColorForMode(metricForMode(feat), viewMode);
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
      .onPolygonClick((poly) => {
        if (!poly) return;
        const feat = poly as CrisisFeature;
        if (feat.__hasCrisis) {
          const iso = feat.properties.ISO_A3 as string;
          setSelectedCountry(iso);
        }
      })
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

    if (viewMode === "predictive-risks" && predictiveRisks) {
      const markers = predictiveRisks.reduce((acc, risk) => {
        const metrics = countryMetrics.get(risk.iso3);
        if (metrics) {
          acc.push({
            lat: metrics.lat,
            lng: metrics.lng,
            risk,
          });
        }
        return acc;
      }, [] as { lat: number; lng: number; risk: PredictiveRisk }[]);

      globe
        .htmlElementsData(markers)
        .htmlElement((d: any) => {
          const el = document.createElement("div");
          el.innerHTML = `
            <div class="relative flex flex-col items-center justify-center translate-x-[-50%] translate-y-[-50%] pointer-events-auto cursor-pointer group">
              <div class="w-8 h-8 bg-red-600/20 border-2 border-red-500 rounded-full animate-ping absolute"></div>
              <div class="w-4 h-4 bg-red-500 rounded-full relative z-10 shadow-[0_0_15px_rgba(239,68,68,0.8)]"></div>
              <div class="absolute top-6 left-1/2 -translate-x-1/2 mt-2 w-64 bg-black/90 border border-red-500/50 rounded-lg p-3 hidden group-hover:block z-50 pointer-events-none">
                <div class="text-[10px] font-bold text-red-500 tracking-widest uppercase mb-1">
                  SYS.PREDICT_RISK :: ${d.risk.risk_level}
                </div>
                <div class="text-sm font-semibold text-white mb-1">
                  ${d.risk.risk_title}
                </div>
                <div class="text-xs text-gray-300 mb-2 leading-relaxed">
                  ${d.risk.risk_description}
                </div>
                <div class="text-[10px] text-gray-500 mb-1 tracking-wider uppercase">Driving Factors:</div>
                <ul class="text-[10px] text-gray-400 list-disc list-inside">
                  ${d.risk.factors.map((f: string) => `<li>${f}</li>`).join('')}
                </ul>
              </div>
            </div>
          `;
          return el;
        });
    } else {
      // Crisis dots at country centroids for non-predictive modes
      const crisisDots = data.reduce((acc, country) => {
        const crises = country.crises ?? [];
        if (crises.length === 0 || !country.lat || !country.lng) return acc;
        acc.push({
          lat: country.lat,
          lng: country.lng,
          crises,
          countryName: country.country_name,
        });
        return acc;
      }, [] as { lat: number; lng: number; crises: Crisis[]; countryName: string }[]);

      globe
        .htmlElementsData(crisisDots)
        .htmlElement((d: any) => {
          const el = document.createElement("div");
          const crises = d.crises as Crisis[];
          const dotSize = 6;
          const gap = 2;
          const cols = Math.min(crises.length, 4);
          const totalW = cols * dotSize + (cols - 1) * gap;
          const severityColor = (sev: string) => {
            switch (sev) {
              case "Very High": return "#ef4444";
              case "High": return "#f97316";
              case "Medium": return "#eab308";
              case "Low": return "#22c55e";
              case "Very Low": return "#10b981";
              default: return "#6b7280";
            }
          };
          const dots = crises.slice(0, 8).map((c) =>
            `<div style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${severityColor(c.severity_class)};box-shadow:0 0 4px ${severityColor(c.severity_class)};"></div>`
          ).join("");
          el.innerHTML = `
            <div style="transform:translate(-50%,-50%);display:flex;flex-wrap:wrap;gap:${gap}px;max-width:${totalW + gap}px;justify-content:center;pointer-events:none;">
              ${dots}
            </div>
          `;
          return el;
        });
    }

  }, [polygonFeatures, comparisonData, viewMode, spotlightIso, hoveredIso, selectedCountry, countryMetrics, setSelectedCountry, predictiveRisks, data]);

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
    const country = data.find((c) => c.iso3 === hoveredIso);
    const crises = country?.crises ?? [];
    const crisisCount = crises.length;
    // Use Math.max to de-duplicate country-level metrics across crisis rows
    const totalFunding = Math.max(0, ...crises.map((c) => c.funding_usd ?? 0));
    const totalPeopleInNeed = Math.max(0, ...crises.map((c) => c.people_in_need ?? 0));
    return {
      name: (feat.properties.NAME as string) ?? hoveredIso,
      iso: hoveredIso,
      crisisCount,
      totalFunding,
      totalPeopleInNeed,
    };
  }, [hoveredIso, polygonFeatures, data]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />

      {/* Year/Month indicator -- top left */}
      <div className="absolute top-4 left-4 z-20 rounded-lg border border-[#00d4ff]/20 bg-[#0d1117]/80 backdrop-blur-sm px-4 py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, year: Math.max(2022, f.year - 1), month: null }))}
          className="text-white/40 hover:text-white/80 text-sm font-mono transition-colors"
          aria-label="Previous year"
        >
          &lt;
        </button>
        <div className="text-center min-w-[100px]">
          <p className="text-lg font-semibold text-white/90 font-mono leading-tight">
            {filters.month != null ? `${MONTH_NAMES[filters.month - 1]} ${filters.year}` : String(filters.year)}
          </p>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">
            {filters.month != null ? "Monthly View" : "Full Year"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, year: Math.min(2026, f.year + 1), month: null }))}
          className="text-white/40 hover:text-white/80 text-sm font-mono transition-colors"
          aria-label="Next year"
        >
          &gt;
        </button>
        <div className="w-px h-6 bg-white/10" />
        <button
          type="button"
          onClick={() =>
            setFilters((f) => {
              if (f.month === null) return { ...f, month: 1 };
              if (f.month <= 1) return { ...f, month: null };
              return { ...f, month: f.month - 1 };
            })
          }
          className="text-white/40 hover:text-white/80 text-xs font-mono transition-colors"
          aria-label="Previous month"
        >
          M-
        </button>
        <button
          type="button"
          onClick={() =>
            setFilters((f) => {
              if (f.month === null) return { ...f, month: 1 };
              if (f.month >= 12) return { ...f, month: null };
              return { ...f, month: f.month + 1 };
            })
          }
          className="text-white/40 hover:text-white/80 text-xs font-mono transition-colors"
          aria-label="Next month"
        >
          M+
        </button>
      </div>

      {/* Hovered country tooltip -- bottom right corner */}
      {hoveredInfo && (
        <div className="absolute bottom-4 right-4 rounded-lg border border-[#00d4ff]/30 bg-[#1a1d21]/90 px-5 py-4 text-base text-white/90 backdrop-blur-sm">
          <div className="font-semibold text-[#00e5ff] text-lg">{hoveredInfo.name} ({hoveredInfo.iso})</div>
          <div className="text-sm text-white/60 mt-2 space-y-1">
            <div className="flex justify-between gap-6">
              <span className="text-white/40">Crises</span>
              <span className="font-mono text-white/80">{hoveredInfo.crisisCount}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-white/40">Total Funding</span>
              <span className="font-mono text-white/80">${formatCompact(hoveredInfo.totalFunding)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-white/40">People in Need</span>
              <span className="font-mono text-white/80">{formatCompact(hoveredInfo.totalPeopleInNeed)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 rounded-lg border border-[#00d4ff]/30 bg-[#1a1d21]/80 px-4 py-3 text-xs text-white/80 backdrop-blur-sm z-10 flex flex-col gap-2 pointer-events-none">
        <div className="font-semibold text-[#00e5ff] uppercase tracking-wider mb-1">
          {viewMode === "funding-gap" ? "Funding Gap" : viewMode === "anomalies" ? "Oversight/Anomalies" : "Severity Index"}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-32 rounded-full" style={{
            background: `linear-gradient(to right, ${(viewMode === "funding-gap" ? FUNDING_GAP_STOPS : viewMode === "anomalies" ? OVERSIGHT_STOPS : SEVERITY_STOPS)
                .map(stop => `rgb(${stop[1]}, ${stop[2]}, ${stop[3]}) ${stop[0] * 100}%`)
                .join(", ")
              })`
          }} />
        </div>
        <div className="flex justify-between w-32 text-[10px] text-white/50">
          <span>{viewMode === "funding-gap" ? "Funded" : viewMode === "anomalies" ? "Covered" : "Low (1)"}</span>
          <span>{viewMode === "funding-gap" ? "Critical" : viewMode === "anomalies" ? "Overlooked" : "High (5)"}</span>
        </div>
      </div>

      {loadingRisks && viewMode === "predictive-risks" && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/80 border border-blue-500/50 rounded-lg px-6 py-3 text-sm text-blue-400 font-mono flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          GEMINI INTELLIGENCE: ANALYZING ACTIAN VECTOR ANOMALIES...
        </div>
      )}

      <GlobeControls globeRef={globeRef} />
      <GenieChartPanel />
      <CountryDetailOverlay countries={data} />
      <AgentActivityFeed />
    </div>
  );
}
