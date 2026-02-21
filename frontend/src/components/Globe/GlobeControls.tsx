"use client";

import React, { useState, useCallback, type RefObject } from "react";
import type { GlobeInstance } from "globe.gl";

const ZOOM_STEP = 0.3;
const MIN_ALTITUDE = 0.4;
const MAX_ALTITUDE = 3.5;
const TRANSITION_MS = 400;

interface GlobeControlsProps {
  globeRef: RefObject<GlobeInstance | null>;
}

export default function GlobeControls({ globeRef }: GlobeControlsProps) {
  const [autoRotate, setAutoRotate] = useState(false);

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
        −
      </button>
      <button
        type="button"
        onClick={handleAutoSpin}
        className={`rounded px-3 py-1.5 text-sm ${autoRotate ? "bg-blue-600 text-white" : "text-white hover:bg-white/10"}`}
        aria-label="Auto spin"
      >
        ⟳
      </button>
    </div>
  );
}
