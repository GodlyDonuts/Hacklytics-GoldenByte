'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface GlobeState {
  selectedCountry: string | null;
  filters: {
    year: number;
    month: number;
    country: string | null;
    crisis: string | null;
    funds: string | null;
    cluster: string | null;
  };
  viewMode: 'severity' | 'funding-gap' | 'anomalies';
  layersVisible: { choropleth: boolean; heatmap: boolean; points: boolean };
  flyToCoordinates: { lat: number; lng: number; altitude?: number } | null;
  comparisonData: {
    sourceIso: string; targetIso: string;
    sourceLat: number; sourceLng: number;
    targetLat: number; targetLng: number;
    sourceStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number; };
    targetStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number; };
  } | null;
}

type GlobeContextValue = GlobeState & {
  setSelectedCountry: (country: string | null) => void;
  setFilters: React.Dispatch<React.SetStateAction<GlobeState['filters']>>;
  setViewMode: (mode: GlobeState['viewMode']) => void;
  setLayersVisible: React.Dispatch<React.SetStateAction<GlobeState['layersVisible']>>;
  setFlyToCoordinates: React.Dispatch<React.SetStateAction<GlobeState['flyToCoordinates']>>;
  setComparisonData: React.Dispatch<React.SetStateAction<GlobeState['comparisonData']>>;
};

const defaultState: GlobeState = {
  selectedCountry: null,
  filters: {
    year: Math.min(2026, Math.max(2022, new Date().getFullYear())),
    month: new Date().getMonth() + 1,
    country: null,
    crisis: null,
    funds: null,
    cluster: null,
  },
  viewMode: 'severity',
  layersVisible: { choropleth: true, heatmap: true, points: true },
  flyToCoordinates: null,
  comparisonData: null,
};

const GlobeContext = createContext<GlobeContextValue | null>(null);

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(defaultState.selectedCountry);
  const [filters, setFilters] = useState<GlobeState['filters']>(defaultState.filters);
  const [viewMode, setViewMode] = useState<GlobeState['viewMode']>(defaultState.viewMode);
  const [layersVisible, setLayersVisible] = useState<GlobeState['layersVisible']>(defaultState.layersVisible);
  const [flyToCoordinates, setFlyToCoordinates] = useState<GlobeState['flyToCoordinates']>(defaultState.flyToCoordinates);
  const [comparisonData, setComparisonData] = useState<GlobeState['comparisonData']>(defaultState.comparisonData);

  const value: GlobeContextValue = {
    selectedCountry,
    filters,
    viewMode,
    layersVisible,
    flyToCoordinates,
    comparisonData,
    setSelectedCountry,
    setFilters,
    setViewMode,
    setLayersVisible,
    setFlyToCoordinates,
    setComparisonData,
  };

  return <GlobeContext.Provider value={value}>{children}</GlobeContext.Provider>;
}

export function useGlobeContext(): GlobeContextValue {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobeContext must be used within GlobeProvider');
  return ctx;
}
