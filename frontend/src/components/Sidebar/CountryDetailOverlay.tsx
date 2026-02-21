"use client";

import { useGlobeContext } from "@/context/GlobeContext";
import CountryDetail from "./CountryDetail";
import { X } from "lucide-react";

/**
 * Renders CountryDetail as a right-side overlay on the globe page.
 * Only shown when a country is selected AND comparison panel is not active.
 */
export function CountryDetailOverlay() {
    const { selectedCountry, comparisonData, setSelectedCountry, filters } = useGlobeContext();

    if (!selectedCountry || comparisonData) return null;

    return (
        <div className="fixed right-0 top-0 h-full w-[450px] bg-black/80 backdrop-blur-xl border-l border-white/10 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="flex justify-end p-4 border-b border-white/10">
                <button
                    onClick={() => setSelectedCountry(null)}
                    className="p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                    <X className="text-white w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                <CountryDetail
                    countryCode={selectedCountry}
                    year={filters.year}
                />
            </div>
        </div>
    );
}
