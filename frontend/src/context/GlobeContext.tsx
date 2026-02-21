'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface GlobeState {
  selectedCountry: string | null;
  filters: { year: number; cluster: string | null };
  viewMode: 'severity' | 'funding-gap' | 'anomalies';
  layersVisible: { choropleth: boolean; heatmap: boolean; points: boolean };
}

type GlobeContextValue = GlobeState & {
  setSelectedCountry: (country: string | null) => void;
  setFilters: React.Dispatch<React.SetStateAction<GlobeState['filters']>>;
  setViewMode: (mode: GlobeState['viewMode']) => void;
  setLayersVisible: React.Dispatch<React.SetStateAction<GlobeState['layersVisible']>>;
};

const defaultState: GlobeState = {
  selectedCountry: null,
  filters: { year: new Date().getFullYear(), cluster: null },
  viewMode: 'severity',
  layersVisible: { choropleth: true, heatmap: true, points: true },
};

const GlobeContext = createContext<GlobeContextValue | null>(null);

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(defaultState.selectedCountry);
  const [filters, setFilters] = useState<GlobeState['filters']>(defaultState.filters);
  const [viewMode, setViewMode] = useState<GlobeState['viewMode']>(defaultState.viewMode);
  const [layersVisible, setLayersVisible] = useState<GlobeState['layersVisible']>(defaultState.layersVisible);

  const value: GlobeContextValue = {
    selectedCountry,
    filters,
    viewMode,
    layersVisible,
    setSelectedCountry,
    setFilters,
    setViewMode,
    setLayersVisible,
  };

  return <GlobeContext.Provider value={value}>{children}</GlobeContext.Provider>;
}

export function useGlobeContext(): GlobeContextValue {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobeContext must be used within GlobeProvider');
  return ctx;
}
