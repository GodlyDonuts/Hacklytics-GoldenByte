'use client';

import dynamic from 'next/dynamic';
import { useRef, useEffect, useState, useCallback } from 'react';

const GlobeGL = dynamic(() => import('react-globe.gl'), { ssr: false });

// Re-export for use in app; implement choropleth, heatmap, and points layers per PLAN.md §2.2
export default function Globe() {
  const globeRef = useRef<unknown>(null);
  const [hoveredCountry, setHoveredCountry] = useState<unknown>(null);
  // TODO: countriesGeo, fundingGapPoints, anomalyProjects from API + GeoJSON
  const handleCountryClick = useCallback(() => {}, []);

  return (
    <GlobeGL
      ref={globeRef}
      globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg"
      backgroundImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png"
      onPolygonClick={handleCountryClick}
      onPolygonHover={setHoveredCountry}
    />
  );
}
