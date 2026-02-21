"use client";

/**
 * Points layer for anomaly / project markers.
 * Pass data + accessors to the single Globe instance (pointsData, pointLat, pointLng, etc.).
 * Does not render its own globe.
 */
export type PointMarker = {
  lat: number;
  lng: number;
  anomalyScore?: number;
  projectCode?: string;
  budget?: number;
  beneficiaries?: number;
};

interface PointsLayerProps {
  data?: PointMarker[];
  visible?: boolean;
}

export default function PointsLayer({ data = [], visible = true }: PointsLayerProps) {
  if (!visible || !data.length) return null;
  return null; // Logical layer: parent GlobeView consumes data and applies point props
}
