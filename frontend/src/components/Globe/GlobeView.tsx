"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Globe, { GlobeInstance } from "globe.gl";
import GlobeControls from "./GlobeControls";
import { useGlobeContext } from "@/context/GlobeContext";
import * as THREE from 'three';

import { getGlobeCrises, GlobeCountry } from "@/lib/api";

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<GlobeCountry | null>(null);
  const { selectedCountry, setSelectedCountry, flyToCoordinates, comparisonData, viewMode, filters } = useGlobeContext();
  const [data, setData] = useState<GlobeCountry[]>([]);

  useEffect(() => {
    // Only fetch if a year filter exists
    if (!filters.year) return;

    getGlobeCrises(filters.year)
      .then((res) => {
        if (res && res.countries) {
          setData(res.countries);
        }
      })
      .catch((err) => console.error("Failed to load globe crises data:", err));
  }, [filters.year]);

  useEffect(() => {
    if (!containerRef.current) return;

    const globe = new Globe(containerRef.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight);

    globeRef.current = globe;

    return () => { globe._destructor?.(); };
  }, []);

  const conesData = useMemo(() => {
    let crisesList: any[] = [];
    data.forEach((country) => {
      const crises = country.crises || [];
      const count = crises.length;
      if (count === 0) return;

      if (viewMode === 'funding-gap') {
        let totalFundingGap = 0;
        crises.forEach(c => totalFundingGap += c.funding_gap_usd || 0);
        let weight = Math.min(totalFundingGap / 1_000_000_000, 1.0);

        crisesList.push({
          lat: country.lat,
          lng: country.lng,
          weight: Math.max(weight, 0.05),
          color: '#ffaa00', // orange
          iso: country.iso3,
          tiltAngle: 0,
          tiltDirection: 0,
          country,
          crisis: crises[0] // pick the first one for tooltip info if needed
        });
        return; // Move to next country
      }

      crises.forEach((crisis, index) => {
        let weight = 0;
        let color = '#ff0000';

        if (viewMode === 'severity') {
          const severity = crisis.acaps_severity || 1; // Map 1 to 5 scale

          if (severity >= 5) {
            weight = 1.5;      // Very tall height (22.5)
            color = '#8b0000'; // dark blood red
          } else if (severity === 4) {
            weight = 1.0;      // Tall height (15.0)
            color = '#cc0000'; // red
          } else if (severity === 3) {
            weight = 0.6;      // Medium height (9.0)
            color = '#ff6600'; // orange
          } else if (severity === 2) {
            weight = 0.3;      // Short height (4.5)
            color = '#ffcc00'; // bright yellow
          } else {
            weight = 0.1;      // Very short height (1.5)
            color = '#fbff00'; // weak yellow
          }
        } else if (viewMode === 'anomalies') {
          let sumB2B = crisis.avg_b2b_ratio || 0;
          weight = Math.min(sumB2B / 100, 1.0);
          color = '#ffff00'; // yellow
        }

        let finalLat = country.lat;
        let finalLng = country.lng;

        if (count > 1) {
          // Instead of purely tilting them from identical origins, 
          // we spread their base locations slightly (like a flower)
          // 0.5 degrees of lat/lng shift by default
          let radius = 1.2;

          // Adjust radius based on country size heuristics
          // Since we don't have land area from the API, we can target known small countries
          // that typically have crisis data: e.g. PSE (Palestine), HTI (Haiti), LBN (Lebanon), 
          // RWA (Rwanda), BDI (Burundi), SLV (El Salvador)
          const smallIsoCodes = ['PSE', 'HTI', 'LBN', 'RWA', 'BDI', 'SLV', 'HND', 'GTM'];
          if (smallIsoCodes.includes(country.iso3)) {
            radius = 0.4; // Significantly smaller spread for tiny countries
          }

          const angle = (index * Math.PI * 2) / count;
          finalLat += radius * Math.cos(angle);
          finalLng += radius * Math.sin(angle);
        }

        crisesList.push({
          lat: finalLat,
          lng: finalLng,
          weight: Math.max(weight, 0.05), // min visual weight
          color,
          iso: country.iso3,
          tiltAngle: 0, // No longer need explicit tilt if we spread the bases
          tiltDirection: 0,
          country,
          crisis
        });
      });
    });
    return crisesList;
  }, [data, viewMode]);

  useEffect(() => {
    if (!globeRef.current || !data.length) return;
    const globe = globeRef.current;

    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson').then(res => res.json()).then(countries => {
      globe
        .polygonsData(countries.features)
        .polygonCapColor(() => 'rgba(0, 0, 0, 0)') // Transparent surface
        .polygonSideColor(() => 'rgba(255, 255, 255, 0.1)') // Transparent sides
        .polygonStrokeColor(() => '#ffffff')      // White border lines
        .polygonAltitude(0.01)                     // Slightly above globe surface
      // .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg');
    });

    globe.heatmapsData([]); // Clear heatmaps if any

    globe
      .customLayerData(conesData)
      .customThreeObject((d: any) => {
        // Create a cone. The weight will determine its height
        // Scale weight nicely for height
        const height = d.weight * 15;
        const geometry = new THREE.ConeGeometry(0.8, height, 16);

        // Translate center to base so it sticks out of the globe instead of piercing it
        geometry.translate(0, height / 2, 0);

        const material = new THREE.MeshLambertMaterial({
          color: d.color,
          transparent: true,
          opacity: 0.9
        });

        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
      })
      .customThreeObjectUpdate((obj: any, d: any) => {
        // Position object on globe
        const coords = globeRef.current!.getCoords(d.lat, d.lng, 0.01);
        Object.assign(obj.position, coords);

        // Orient cone outwardly
        // Cone points along local +Y axis. We align this +Y axis with the normal from the globe center.
        const normal = obj.position.clone().normalize();

        // Base orientation: pointing up from the surface
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

        // Apply individual tilts to fan them out if multiple
        if (d.tiltAngle) {
          // Create a rotation around the local X axis
          const tiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), d.tiltAngle);

          // Create a rotation around the local Y axis to spread them
          const spreadQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.tiltDirection);

          // Combine rotations: first tilt, then spread, then orient to surface normal
          tiltQuat.premultiply(spreadQuat);
          tiltQuat.premultiply(quaternion);

          obj.quaternion.copy(tiltQuat);
        } else {
          obj.quaternion.copy(quaternion);
        }
      })
      .enablePointerInteraction(true)
      .onCustomLayerClick((obj, _event, _coords) => {
        const d = obj as any;
        if (d && d.iso) {
          setSelectedCountry(d.iso);
          setSelectedPoint(d.country);
        }
      });

    globe
      .htmlElementsData(selectedPoint ? [selectedPoint] : [])
      .htmlLat((o) => (o as GlobeCountry).lat || 0)
      .htmlLng((o) => (o as GlobeCountry).lng || 0)
      .htmlAltitude(0.2) // Fixed altitude or calculate based on aggregated severity
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

    // Configure Comparison Arcs
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
  }, [data, conesData, selectedPoint, setSelectedCountry, comparisonData]);

  // Handle flyToCoordinates changes
  useEffect(() => {
    if (flyToCoordinates && globeRef.current) {
      globeRef.current.pointOfView(
        {
          lat: flyToCoordinates.lat,
          lng: flyToCoordinates.lng,
          altitude: flyToCoordinates.altitude ?? 1.5
        },
        2000 // Transition duration in ms
      );
    }
  }, [flyToCoordinates]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />
      {selectedCountry && (
        <div className="absolute bottom-4 right-4 rounded bg-black/70 px-3 py-2 text-sm text-white">
          Selected: {selectedCountry}
        </div>
      )}
      <GlobeControls globeRef={globeRef} />
    </div>
  );
}

function nearestPoint(data: GlobeCountry[], lat: number, lng: number): GlobeCountry {
  if (data.length === 0) return {} as GlobeCountry;
  let best = data[0];
  let bestD = Infinity;
  for (const country of data) {
    const plat = country.lat || 0;
    const plng = country.lng || 0;
    const d = (plat - lat) ** 2 + (plng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = country;
    }
  }
  return best;
}
