"use client";

/**
 * Arcs layer for flows or connections between points.
 * Pass data + accessors to the single Globe instance (arcsData, arcStartLat, etc.).
 * Does not render its own globe.
 */
export type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color?: string;
};

interface ArcsLayerProps {
  data?: Arc[];
  visible?: boolean;
}

export default function ArcsLayer({ data = [], visible = true }: ArcsLayerProps) {
  if (!visible || !data.length) return null;
  return null; // Logical layer: parent GlobeView consumes data and applies arc props
}
