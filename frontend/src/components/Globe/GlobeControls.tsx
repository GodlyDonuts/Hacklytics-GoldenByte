"use client";

import React, { useState, useCallback, type RefObject } from "react";
import type { GlobeInstance } from "globe.gl";
import { useGlobeContext } from "@/context/GlobeContext";

const ZOOM_STEP = 0.3;
const MIN_ALTITUDE = 0.4;
const MAX_ALTITUDE = 3.5;
const TRANSITION_MS = 400;

const VIEW_MODES = [
  { key: "severity" as const, label: "Severity", desc: "ACAPS crisis severity" },
  { key: "funding-gap" as const, label: "Funding Gap", desc: "Unmet funding needs" },
  { key: "anomalies" as const, label: "Overlooked", desc: "Oversight score (most overlooked)" },
  { key: "predictive-risks" as const, label: "Predictive Risks", desc: "AI-generated future safety risks" },
] as const;

interface GlobeControlsProps {
  globeRef: RefObject<GlobeInstance | null>;
}

export default function GlobeControls({ globeRef }: GlobeControlsProps) {
  const [autoRotate, setAutoRotate] = useState(false);
  const { viewMode, setViewMode } = useGlobeContext();

  const handleZoomIn = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    const pov = g.pointOfView();
    const alt = typeof pov.altitude === "number" ? pov.altitude : 2.5;
    g.pointOfView({ ...pov, altitude: Math.max(MIN_ALTITUDE, alt - ZOOM_STEP) }, TRANSITION_MS);
  }, [globeRef]);

  const handleZoomOut = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    const pov = g.pointOfView();
    const alt = typeof pov.altitude === "number" ? pov.altitude : 2.5;
    g.pointOfView({ ...pov, altitude: Math.min(MAX_ALTITUDE, alt + ZOOM_STEP) }, TRANSITION_MS);
  }, [globeRef]);

  const handleAutoSpin = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    const next = !autoRotate;
    g.controls().autoRotate = next;
    g.controls().autoRotateSpeed = 0.5;
    setAutoRotate(next);
  }, [globeRef, autoRotate]);

  return (
    <>
      {/* View mode selector -- top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 rounded-xl bg-[#0d1117]/80 backdrop-blur-md border border-white/10 p-1">
        {VIEW_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setViewMode(m.key)}
            title={m.desc}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${viewMode === m.key
                ? "bg-[#00d4ff]/20 text-[#00d4ff] shadow-sm"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Zoom + spin controls -- bottom left */}
      <div className="absolute bottom-4 left-4 flex gap-2 rounded-lg bg-black/50 p-2">
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded px-3 py-1.5 text-sm text-white hover:bg-white/10"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="rounded px-3 py-1.5 text-sm text-white hover:bg-white/10"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={handleAutoSpin}
          className={`rounded px-3 py-1.5 text-sm ${autoRotate ? "bg-blue-600 text-white" : "text-white hover:bg-white/10"}`}
          aria-label="Auto spin"
        >
          Spin
        </button>
      </div>
    </>
  );
}
