'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface GenieChartData {
  question: string;
  columns: { name: string; type: string }[];
  rows: (string | number | null)[][];
  description: string | null;
  sql: string | null;
}

export interface PredictiveRisk {
  iso3: string;
  country_name: string;
  risk_level: string;
  risk_title: string;
  risk_description: string;
  confidence_score: number;
  factors: string[];
}

export interface GlobeState {
  selectedCountry: string | null;
  isSpotlightActive: boolean;
  nearestSpotlightIso: string | null;
  filters: {
    year: number;
    month: number | null;
    country: string | null;
    crisis: string | null;
    funds: string | null;
    cluster: string | null;
  };
  viewMode: 'severity' | 'funding-gap' | 'anomalies' | 'predictive-risks';
  layersVisible: { choropleth: boolean; heatmap: boolean; points: boolean };
  flyToCoordinates: { lat: number; lng: number; altitude?: number } | null;
  comparisonData: {
    sourceIso: string; targetIso: string;
    sourceLat: number; sourceLng: number;
    targetLat: number; targetLng: number;
    sourceStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number; };
    targetStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number; };
  } | null;
  genieChartData: GenieChartData | null;
  predictiveRisks: PredictiveRisk[] | null;
}

type GlobeContextValue = GlobeState & {
  setSelectedCountry: (country: string | null) => void;
  setIsSpotlightActive: (active: boolean) => void;
  setNearestSpotlightIso: (iso: string | null) => void;
  setFilters: React.Dispatch<React.SetStateAction<GlobeState['filters']>>;
  setViewMode: (mode: GlobeState['viewMode']) => void;
  setLayersVisible: React.Dispatch<React.SetStateAction<GlobeState['layersVisible']>>;
  setFlyToCoordinates: React.Dispatch<React.SetStateAction<GlobeState['flyToCoordinates']>>;
  setComparisonData: React.Dispatch<React.SetStateAction<GlobeState['comparisonData']>>;
  setGenieChartData: React.Dispatch<React.SetStateAction<GlobeState['genieChartData']>>;
  setPredictiveRisks: React.Dispatch<React.SetStateAction<GlobeState['predictiveRisks']>>;
};

const defaultState: GlobeState = {
  selectedCountry: null,
  isSpotlightActive: false,
  nearestSpotlightIso: null,
  filters: {
    year: 2024,
    month: 1,
    country: null,
    crisis: null,
    funds: null,
    cluster: null,
  },
  viewMode: 'severity',
  layersVisible: { choropleth: true, heatmap: true, points: true },
  flyToCoordinates: null,
  comparisonData: null,
  genieChartData: null,
  predictiveRisks: null,
};

const GlobeContext = createContext<GlobeContextValue | null>(null);

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(defaultState.selectedCountry);
  const [isSpotlightActive, setIsSpotlightActive] = useState<boolean>(defaultState.isSpotlightActive);
  const [nearestSpotlightIso, setNearestSpotlightIso] = useState<string | null>(defaultState.nearestSpotlightIso);
  const [filters, setFilters] = useState<GlobeState['filters']>(defaultState.filters);
  const [viewMode, setViewMode] = useState<GlobeState['viewMode']>(defaultState.viewMode);
  const [layersVisible, setLayersVisible] = useState<GlobeState['layersVisible']>(defaultState.layersVisible);
  const [flyToCoordinates, setFlyToCoordinates] = useState<GlobeState['flyToCoordinates']>(defaultState.flyToCoordinates);
  const [comparisonData, setComparisonData] = useState<GlobeState['comparisonData']>(defaultState.comparisonData);
  const [genieChartData, setGenieChartData] = useState<GlobeState['genieChartData']>(defaultState.genieChartData);
  const [predictiveRisks, setPredictiveRisks] = useState<GlobeState['predictiveRisks']>(defaultState.predictiveRisks);

  const value: GlobeContextValue = {
    selectedCountry,
    isSpotlightActive,
    nearestSpotlightIso,
    filters,
    viewMode,
    layersVisible,
    flyToCoordinates,
    comparisonData,
    genieChartData,
    predictiveRisks,
    setSelectedCountry,
    setIsSpotlightActive,
    setNearestSpotlightIso,
    setFilters,
    setViewMode,
    setLayersVisible,
    setFlyToCoordinates,
    setComparisonData,
    setGenieChartData,
    setPredictiveRisks,
  };

  return <GlobeContext.Provider value={value}>{children}</GlobeContext.Provider>;
}

export function useGlobeContext(): GlobeContextValue {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobeContext must be used within GlobeProvider');
  return ctx;
}
