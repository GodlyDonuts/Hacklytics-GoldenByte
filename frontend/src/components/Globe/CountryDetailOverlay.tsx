"use client";

/**
 * CountryDetailOverlay
 *
 * Right-side panel that appears when a country is selected (click on globe polygon).
 * Two sections:
 *   1. Crisis cards -- severity, funding, coverage, oversight for each crisis
 *   2. Project B2B breakdown -- fetched on demand, flags outliers, benchmarking
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import { useGlobeContext } from "@/context/GlobeContext";
import {
  type GlobeCountry,
  type Crisis,
  type B2BProject,
  type BenchmarkNeighbor,
  getGlobeB2B,
  benchmarkProject,
} from "@/lib/api";

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Very High": { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
  "High": { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  "Medium": { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
  "Low": { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  "Very Low": { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
};

function formatCompact(v: number | null | undefined): string {
  if (v === null || v === undefined) return "--";
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function CoverageBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    clamped >= 60 ? "bg-emerald-500" : clamped >= 30 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-base text-white/80 font-mono">{value}</p>
    </div>
  );
}

// -- Crisis Card --

function CrisisCard({ crisis, index }: { crisis: Crisis; index: number }) {
  const sev = SEVERITY_COLORS[crisis.severity_class] ?? SEVERITY_COLORS["Medium"];
  return (
    <div className={`rounded-lg border ${sev.border} bg-white/[0.03] p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-white/90 leading-snug">
            {crisis.crisis_name || `Crisis ${index + 1}`}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${sev.bg} ${sev.text}`}>
              {crisis.severity_class}
            </span>
            <span className="text-xs text-white/40">
              Severity {crisis.acaps_severity?.toFixed(1) ?? "--"}
            </span>
            {crisis.has_hrp && <span className="text-xs text-cyan-400/70">HRP</span>}
          </div>
        </div>
        {crisis.crisis_rank != null && crisis.crisis_rank > 0 && (
          <span className="shrink-0 text-sm text-white/30 font-mono">#{crisis.crisis_rank}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Metric label="People in Need" value={formatCompact(crisis.people_in_need)} />
        <Metric label="Target Beneficiaries" value={formatCompact(crisis.target_beneficiaries)} />
        <Metric label="Funding Gap" value={`$${formatCompact(crisis.funding_gap_usd)}`} />
        <Metric label="Coverage" value={`${crisis.funding_coverage_pct?.toFixed(1) ?? "--"}%`} />
        <Metric label="B2B Ratio" value={crisis.b2b_ratio != null ? crisis.b2b_ratio.toFixed(3) : "--"} />
        <Metric label="Oversight" value={crisis.oversight_score != null ? crisis.oversight_score.toFixed(2) : "--"} />
      </div>
      {crisis.funding_coverage_pct != null && <CoverageBar pct={crisis.funding_coverage_pct} />}
    </div>
  );
}

// -- Project Card with outlier flag --

function ProjectCard({
  project,
  onBenchmark,
}: {
  project: B2BProject;
  onBenchmark: (code: string) => void;
}) {
  const isOutlier = project.is_outlier;
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        isOutlier
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/80 leading-snug truncate">
            {project.project_name ?? project.project_code ?? "Unknown"}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            {project.cluster ?? "No cluster"} | {project.project_code}
          </p>
        </div>
        {isOutlier && (
          <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 uppercase">
            Outlier
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] text-white/30 uppercase">B2B</p>
          <p className={`text-sm font-mono ${isOutlier ? "text-amber-400" : "text-white/70"}`}>
            {project.b2b_ratio?.toFixed(3) ?? "--"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-white/30 uppercase">Cluster Median</p>
          <p className="text-sm font-mono text-white/50">
            {project.cluster_median_b2b?.toFixed(3) ?? "--"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-white/30 uppercase">Budget</p>
          <p className="text-sm font-mono text-white/70">
            ${formatCompact(project.requested_funds)}
          </p>
        </div>
      </div>

      {/* B2B percentile bar */}
      {project.b2b_percentile != null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isOutlier ? "bg-amber-500" : "bg-[#00d4ff]"
              }`}
              style={{ width: `${Math.min(100, project.b2b_percentile * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-white/30 font-mono w-8 text-right">
            P{(project.b2b_percentile * 100).toFixed(0)}
          </span>
        </div>
      )}

      {project.project_code && (
        <button
          type="button"
          onClick={() => onBenchmark(project.project_code!)}
          className="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-medium text-[#00d4ff]/80 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 transition-colors"
        >
          Find comparable projects
        </button>
      )}
    </div>
  );
}

// -- Benchmark Results --

function BenchmarkResults({
  insight,
  neighbors,
  onClose,
}: {
  insight: string;
  neighbors: BenchmarkNeighbor[];
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/[0.04] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[#00d4ff]">Benchmark Comparison</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white/70"
        >
          close
        </button>
      </div>
      <p className="text-sm text-white/60 leading-relaxed">{insight}</p>
      {neighbors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/40 uppercase">Comparable Projects</p>
          {neighbors.map((n, i) => (
            <div
              key={n.project_code ?? i}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md bg-white/[0.03] border border-white/5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/70 truncate">
                  {n.project_name ?? n.project_code}
                </p>
                <p className="text-[11px] text-white/30">
                  {n.country_name ?? n.iso3} | {n.cluster}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono text-white/70">
                  B2B {n.b2b_ratio?.toFixed(3) ?? "--"}
                </p>
                {n.b2b_delta != null && (
                  <p
                    className={`text-[11px] font-mono ${
                      n.b2b_delta > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {n.b2b_delta > 0 ? "+" : ""}
                    {n.b2b_delta.toFixed(3)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Main Overlay --

interface CountryDetailOverlayProps {
  countries: GlobeCountry[];
}

export default function CountryDetailOverlay({ countries }: CountryDetailOverlayProps) {
  const { selectedCountry, setSelectedCountry, filters } = useGlobeContext();

  // B2B project data (fetched on demand)
  const [projects, setProjects] = useState<B2BProject[]>([]);
  const [b2bSummary, setB2bSummary] = useState<{
    weighted_b2b: number | null;
    median_b2b: number | null;
    total_projects: number;
    outlier_count: number;
  } | null>(null);
  const [b2bLoading, setB2bLoading] = useState(false);
  const [showProjects, setShowProjects] = useState(false);

  // Benchmark state
  const [benchmarkResult, setBenchmarkResult] = useState<{
    insight: string;
    neighbors: BenchmarkNeighbor[];
  } | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const country = useMemo(() => {
    if (!selectedCountry) return null;
    return countries.find((c) => c.iso3 === selectedCountry) ?? null;
  }, [selectedCountry, countries]);

  // Reset state when country changes
  useEffect(() => {
    setProjects([]);
    setB2bSummary(null);
    setShowProjects(false);
    setBenchmarkResult(null);
  }, [selectedCountry]);

  // Fetch B2B data when projects section is expanded
  useEffect(() => {
    if (!showProjects || !selectedCountry || projects.length > 0) return;
    let cancelled = false;
    setB2bLoading(true);
    getGlobeB2B(selectedCountry, filters.year)
      .then((res) => {
        if (cancelled) return;
        setProjects(res.projects ?? []);
        setB2bSummary(res.summary);
      })
      .catch((err) => console.error("Failed to fetch B2B data:", err))
      .finally(() => { if (!cancelled) setB2bLoading(false); });
    return () => { cancelled = true; };
  }, [showProjects, selectedCountry, filters.year, projects.length]);

  const handleBenchmark = useCallback(async (projectCode: string) => {
    setBenchmarkLoading(true);
    setBenchmarkResult(null);
    try {
      const res = await benchmarkProject(projectCode);
      setBenchmarkResult({ insight: res.insight, neighbors: res.neighbors });
    } catch (err) {
      console.error("Benchmark failed:", err);
      setBenchmarkResult({ insight: "Benchmark unavailable.", neighbors: [] });
    } finally {
      setBenchmarkLoading(false);
    }
  }, []);

  if (!country) return null;

  const crises = country.crises ?? [];
  const totalPeopleInNeed = crises.reduce((s, c) => s + (c.people_in_need ?? 0), 0);
  const totalGap = crises.reduce((s, c) => s + (c.funding_gap_usd ?? 0), 0);
  const outlierProjects = projects.filter((p) => p.is_outlier);

  return (
    <div className="absolute top-4 right-4 z-30 w-[420px] max-h-[calc(100vh-2rem)] flex flex-col rounded-xl border border-[#00d4ff]/20 bg-[#0d1117]/95 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/10">
        <div>
          <p className="text-xl font-semibold text-white">{country.country_name}</p>
          <p className="text-sm text-white/40 mt-0.5">
            {country.iso3} -- {crises.length} crisis{crises.length !== 1 ? "es" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedCountry(null)}
          className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close panel"
        >
          x
        </button>
      </div>

      {/* Summary bar */}
      <div className="px-5 py-3.5 border-b border-white/5 flex gap-6">
        <div>
          <p className="text-xs text-white/40 uppercase">People in Need</p>
          <p className="text-base text-white/90 font-semibold">{formatCompact(totalPeopleInNeed)}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase">Funding Gap</p>
          <p className="text-base text-white/90 font-semibold">${formatCompact(totalGap)}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase">Crises</p>
          <p className="text-base text-white/90 font-semibold">{crises.length}</p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
        {/* Section: Crises */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-white/50 uppercase tracking-wider">
            Crisis Details
          </p>
          {crises.length > 0 ? (
            crises.map((crisis, idx) => (
              <CrisisCard key={`${crisis.crisis_id ?? 'crisis'}-${idx}`} crisis={crisis} index={idx} />
            ))
          ) : (
            <p className="text-sm text-white/40 text-center py-4">No crisis data.</p>
          )}
        </div>

        {/* Section: Projects (expandable) */}
        <div className="space-y-3 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={() => setShowProjects(!showProjects)}
            className="w-full flex items-center justify-between text-sm font-medium text-white/50 uppercase tracking-wider hover:text-white/70 transition-colors"
          >
            <span>
              Project-Level B2B Analysis
              {b2bSummary && (
                <span className="ml-2 text-xs normal-case text-amber-400">
                  {b2bSummary.outlier_count} outlier{b2bSummary.outlier_count !== 1 ? "s" : ""}
                </span>
              )}
            </span>
            <span className="text-white/30">{showProjects ? "v" : ">"}</span>
          </button>

          {showProjects && (
            <>
              {b2bLoading && (
                <p className="text-xs text-white/30 text-center py-4">Loading projects...</p>
              )}

              {!b2bLoading && b2bSummary && (
                <div className="grid grid-cols-3 gap-3 px-1">
                  <div>
                    <p className="text-[11px] text-white/30 uppercase">Weighted B2B</p>
                    <p className="text-sm font-mono text-white/70">
                      {b2bSummary.weighted_b2b?.toFixed(3) ?? "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-white/30 uppercase">Median B2B</p>
                    <p className="text-sm font-mono text-white/70">
                      {b2bSummary.median_b2b?.toFixed(3) ?? "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-white/30 uppercase">Projects</p>
                    <p className="text-sm font-mono text-white/70">{b2bSummary.total_projects}</p>
                  </div>
                </div>
              )}

              {/* Outliers first */}
              {outlierProjects.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-amber-400/70 uppercase">
                    Flagged Projects ({outlierProjects.length})
                  </p>
                  {outlierProjects.map((p, i) => (
                    <ProjectCard
                      key={p.project_code ?? i}
                      project={p}
                      onBenchmark={handleBenchmark}
                    />
                  ))}
                </div>
              )}

              {/* Normal projects */}
              {projects.filter((p) => !p.is_outlier).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-white/30 uppercase">
                    Other Projects ({projects.filter((p) => !p.is_outlier).length})
                  </p>
                  {projects
                    .filter((p) => !p.is_outlier)
                    .slice(0, 10)
                    .map((p, i) => (
                      <ProjectCard
                        key={p.project_code ?? i}
                        project={p}
                        onBenchmark={handleBenchmark}
                      />
                    ))}
                  {projects.filter((p) => !p.is_outlier).length > 10 && (
                    <p className="text-xs text-white/30 text-center">
                      +{projects.filter((p) => !p.is_outlier).length - 10} more
                    </p>
                  )}
                </div>
              )}

              {!b2bLoading && projects.length === 0 && (
                <p className="text-xs text-white/30 text-center py-4">
                  No project data available.
                </p>
              )}
            </>
          )}
        </div>

        {/* Benchmark results */}
        {benchmarkLoading && (
          <p className="text-xs text-white/30 text-center py-2">Finding comparable projects...</p>
        )}
        {benchmarkResult && (
          <BenchmarkResults
            insight={benchmarkResult.insight}
            neighbors={benchmarkResult.neighbors}
            onClose={() => setBenchmarkResult(null)}
          />
        )}
      </div>
    </div>
  );
}
