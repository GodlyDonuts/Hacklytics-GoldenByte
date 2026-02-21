"use client";

/**
 * Heatmap layer config for funding-gap intensity.
 * Pass data + accessors to the single Globe instance (e.g. heatmapsData, heatmapPointLat, etc.).
 * Does not render its own globe.
 */
export type HeatmapPoint = { lat: number; lng: number; weight: number; country?: string };

interface HeatmapLayerProps {
  data?: HeatmapPoint[];
  visible?: boolean;
}

export default function HeatmapLayer({ data = [], visible = true }: HeatmapLayerProps) {
  if (!visible || !data.length) return null;
  return null; // Logical layer: parent GlobeView consumes data and applies heatmap props
}
