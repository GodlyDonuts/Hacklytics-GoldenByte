"use client";

import React from "react";
import { useGlobeContext } from "@/context/GlobeContext";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

const YEARS = [2022, 2023, 2024, 2025, 2026];

const COUNTRIES = [
  { value: null, label: "All countries" },
  { value: "SDN", label: "Sudan" },
  { value: "YEM", label: "Yemen" },
  { value: "IRQ", label: "Iraq" },
  { value: "LBN", label: "Lebanon" },
  { value: "SYR", label: "Syria" },
  { value: "SSD", label: "South Sudan" },
  { value: "AFG", label: "Afghanistan" },
  { value: "NGA", label: "Nigeria" },
  { value: "KEN", label: "Kenya" },
  { value: "SOM", label: "Somalia" },
];

const CRISES = [
  { value: null, label: "All crises" },
  { value: "conflict", label: "Conflict" },
  { value: "drought", label: "Drought" },
  { value: "flood", label: "Flood" },
  { value: "displacement", label: "Displacement" },
  { value: "food-security", label: "Food security" },
];

const FUNDS = [
  { value: null, label: "All funds" },
  { value: "CERF", label: "CERF" },
  { value: "CBPF", label: "CBPF" },
  { value: "HRP", label: "HRP" },
  { value: "FA", label: "Flash Appeal" },
];

interface DataFiltersModalProps {
  open: boolean;
  onToggle: () => void;
}

export default function DataFiltersModal({ open, onToggle }: DataFiltersModalProps) {
  const { filters, setFilters } = useGlobeContext();

  const tabClass =
    "flex h-14 w-6 shrink-0 items-center justify-center text-[#00d4ff] shadow-[0_0_12px_rgba(0,212,255,0.2)] transition hover:bg-[#33363b] hover:border-[#00d4ff] hover:shadow-[0_0_16px_rgba(0,212,255,0.3)] border-[#00d4ff]/50 bg-[#2a2d32]/95";

  return (
    <div
      className={`absolute left-0 top-0 bottom-0 z-40 overflow-hidden transition-[width] duration-250 ease-out ${
        open ? "w-[344px]" : "min-w-6"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-filters-title"
      aria-expanded={open}
    >
      {/* Open tab: fades out when panel opens */}
      <button
        type="button"
        onClick={onToggle}
        className={`filters-toggle-tab absolute left-0 top-1/2 -translate-y-1/2 rounded-r border border-l-0 transition-all duration-200 ease-out ${tabClass} ${
          open ? "pointer-events-none translate-x-1 opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label="Open filters"
        aria-hidden={open}
      >
        <span className="text-sm font-bold leading-none" aria-hidden>›</span>
      </button>

      {/* Floating panel: slides in from left when opening */}
      <div
        className={`absolute left-0 top-1/2 flex -translate-y-1/2 items-stretch transition-[transform,opacity] duration-250 ease-out ${
          open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none"
        }`}
        style={{ height: "min(80vh, 560px)" }}
      >
          <div className="data-filters-modal relative flex h-full w-80 flex-col overflow-hidden rounded-r-lg border border-l-0 border-[#00d4ff]/40 bg-[#2a2d32] shadow-[0_0_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,212,255,0.2)]">
            {/* Circuit-style background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(90deg, #00d4ff 1px, transparent 1px),
                  linear-gradient(#00d4ff 1px, transparent 1px)
                `,
                backgroundSize: "20px 20px",
              }}
            />

            {/* Header */}
            <div className="relative shrink-0 border-b border-[#00d4ff]/40 px-5 py-3">
              <h2
                id="data-filters-title"
                className="text-sm font-semibold uppercase tracking-widest text-white"
              >
                Data filters
              </h2>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
              {/* MONTH */}
          <section className="border-b border-[#00d4ff]/30 pb-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
              Month
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, month: null }))}
                className={`min-w-[2.5rem] rounded px-2 py-1.5 text-xs font-medium transition ${
                  filters.month === null
                    ? "bg-[#00d4ff]/20 text-[#00e5ff] shadow-[0_0_8px_rgba(0,212,255,0.3)] border border-[#00d4ff]/50"
                    : "border border-white/20 bg-white/5 text-white/80 hover:border-[#00d4ff]/40 hover:text-white"
                }`}
              >
                All
              </button>
              {MONTHS.map((m, i) => {
                const monthNum = i + 1;
                const isActive = filters.month === monthNum;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, month: monthNum }))}
                    className={`min-w-[2.5rem] rounded px-2 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-[#00d4ff]/20 text-[#00e5ff] shadow-[0_0_8px_rgba(0,212,255,0.3)] border border-[#00d4ff]/50"
                        : "border border-white/20 bg-white/5 text-white/80 hover:border-[#00d4ff]/40 hover:text-white"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </section>

          {/* YEAR */}
          <section className="border-b border-[#00d4ff]/30 pb-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
              Year
            </div>
            <div className="flex flex-wrap gap-1">
              {YEARS.map((y) => {
                const isActive = filters.year === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, year: y }))}
                    className={`min-w-[3rem] rounded px-2 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-[#00d4ff]/20 text-[#00e5ff] shadow-[0_0_8px_rgba(0,212,255,0.3)] border border-[#00d4ff]/50"
                        : "border border-white/20 bg-white/5 text-white/80 hover:border-[#00d4ff]/40 hover:text-white"
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </section>

          {/* COUNTRY */}
          <section className="border-b border-[#00d4ff]/30 pb-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
              Country
            </div>
            <select
              value={filters.country ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  country: e.target.value || null,
                }))
              }
              className="data-filters-select w-full rounded border border-[#00d4ff]/40 bg-[#1e2023] px-3 py-2 text-sm text-[#00e5ff] outline-none transition focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/50"
            >
              {COUNTRIES.map((c) => (
                <option key={c.value ?? "all"} value={c.value ?? ""}>
                  {c.label}
                </option>
              ))}
            </select>
          </section>

          {/* CRISIS */}
          <section className="border-b border-[#00d4ff]/30 pb-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
              Crisis
            </div>
            <select
              value={filters.crisis ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  crisis: e.target.value || null,
                }))
              }
              className="data-filters-select w-full rounded border border-[#00d4ff]/40 bg-[#1e2023] px-3 py-2 text-sm text-[#00e5ff] outline-none transition focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/50"
            >
              {CRISES.map((c) => (
                <option key={c.value ?? "all"} value={c.value ?? ""}>
                  {c.label}
                </option>
              ))}
            </select>
          </section>

          {/* FUNDS */}
          <section>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
              Funds
            </div>
            <select
              value={filters.funds ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  funds: e.target.value || null,
                }))
              }
              className="data-filters-select w-full rounded border border-[#00d4ff]/40 bg-[#1e2023] px-3 py-2 text-sm text-[#00e5ff] outline-none transition focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/50"
            >
              {FUNDS.map((f) => (
                <option key={f.value ?? "all"} value={f.value ?? ""}>
                  {f.label}
                </option>
              ))}
            </select>
            </section>
            </div>

            {/* Footer with current summary */}
            <div className="relative shrink-0 border-t border-[#00d4ff]/30 bg-[#1e2023]/80 px-5 py-3">
              <div className="text-[10px] uppercase tracking-wider text-white/60">
                Display: {filters.month ? MONTHS[filters.month - 1] : 'All'} {filters.year}
                {filters.country && ` · ${filters.country}`}
                {filters.crisis && ` · ${filters.crisis}`}
                {filters.funds && ` · ${filters.funds}`}
              </div>
            </div>
          </div>

          {/* Arrow toggle on the right edge of the panel — closes and reappears on the left */}
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-l border border-r-0 ${tabClass}`}
            aria-label="Close filters"
          >
            <span className="text-sm font-bold leading-none" aria-hidden>‹</span>
          </button>
        </div>
    </div>
  );
}
