"use client";

import { useState } from "react";
import { benchmarkProject, type BenchmarkResponse } from "@/lib/api";

const C = {
    bg: "#0a0e14",
    surface: "#0d1117",
    elevated: "#161b22",
    text: "rgba(255,255,255,0.9)",
    textMuted: "rgba(255,255,255,0.3)",
    textSecondary: "rgba(255,255,255,0.5)",
    border: "rgba(255,255,255,0.08)",
    accent: "#00d4ff",
    accentSecondary: "#00e5a0",
} as const;

export default function ActianBenchmark({
    onClose
}: {
    onClose?: () => void;
}) {
    const [projectCode, setProjectCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BenchmarkResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleBenchmark = async () => {
        if (!projectCode.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await benchmarkProject(projectCode, 5);
            setResult(res);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="rounded-lg border flex flex-col h-full overflow-hidden"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
            {/* Header */}
            <div
                className="px-5 py-3.5 border-b flex justify-between items-center"
                style={{ borderColor: C.border }}
            >
                <h3 className="text-sm font-semibold tracking-[-0.01em]" style={{ color: C.text }}>
                    Project Benchmark
                </h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                        style={{ color: C.textMuted }}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 3l8 8M11 3l-8 8" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="px-5 py-4 border-b" style={{ borderColor: C.border }}>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={projectCode}
                        onChange={(e) => setProjectCode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleBenchmark()}
                        placeholder="Country, sector, or project code..."
                        className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none transition-colors"
                        style={{
                            backgroundColor: C.bg,
                            borderColor: C.border,
                            color: C.text,
                        }}
                    />
                    <button
                        onClick={handleBenchmark}
                        disabled={loading || !projectCode.trim()}
                        className="px-3.5 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            backgroundColor: C.accent,
                            color: "#0a0e14",
                        }}
                    >
                        {loading ? "Searching..." : "Search"}
                    </button>
                </div>
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: C.textMuted }}>
                    Find similar OCHA projects by vector similarity across 8,000+ embedded interventions.
                </p>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ backgroundColor: C.bg }}>
                {error && (
                    <div
                        className="p-3 rounded-md text-sm text-red-400 border"
                        style={{ backgroundColor: "rgba(239, 68, 68, 0.06)", borderColor: "rgba(239, 68, 68, 0.15)" }}
                    >
                        {error}
                    </div>
                )}

                {result && (
                    <div className="space-y-4">
                        {/* Matched project */}
                        <div
                            className="p-3.5 rounded-md border"
                            style={{ backgroundColor: C.surface, borderColor: C.border }}
                        >
                            <p className="text-[11px] font-medium mb-1" style={{ color: C.textMuted }}>
                                Matched project
                            </p>
                            <p className="text-sm font-medium" style={{ color: C.text }}>
                                {result.query_project.project_name || result.query_project.project_code}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: C.textMuted }}>
                                <span>{result.query_project.cluster}</span>
                                <span className="tabular-nums" style={{ color: C.accent }}>
                                    ${result.query_project.cost_per_beneficiary?.toFixed(2)}/beneficiary
                                </span>
                            </div>
                        </div>

                        {/* AI insight */}
                        {result.insight && (
                            <div
                                className="p-3.5 rounded-md border"
                                style={{
                                    backgroundColor: "rgba(0,212,255,0.06)",
                                    borderColor: "rgba(0,212,255,0.15)",
                                }}
                            >
                                <p className="text-[11px] font-medium mb-1" style={{ color: C.accent }}>
                                    Analysis
                                </p>
                                <p className="text-xs leading-relaxed" style={{ color: C.text }}>
                                    {result.insight}
                                </p>
                            </div>
                        )}

                        {/* Neighbors */}
                        <div>
                            <p className="text-[11px] font-medium mb-2.5" style={{ color: C.textMuted }}>
                                Similar projects ({result.neighbors.length})
                            </p>
                            <div className="space-y-1.5">
                                {result.neighbors.map((n, i) => (
                                    <div
                                        key={n.project_code || i}
                                        className="p-3 rounded-md border"
                                        style={{ backgroundColor: C.surface, borderColor: C.border }}
                                    >
                                        <div className="flex justify-between items-start gap-3 mb-1">
                                            <p className="text-xs font-medium line-clamp-2" style={{ color: C.text }}>
                                                {n.project_name || n.project_code}
                                            </p>
                                            <span
                                                className="text-[10px] tabular-nums font-medium px-1.5 py-0.5 rounded shrink-0"
                                                style={{
                                                    color: C.accentSecondary,
                                                    backgroundColor: "rgba(0,229,160,0.1)",
                                                }}
                                            >
                                                {((n.similarity_score ?? 0) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-[11px]" style={{ color: C.textMuted }}>
                                            <span className="font-medium tabular-nums">{n.iso3}</span>
                                            <span>{n.cluster}</span>
                                            <span className="ml-auto tabular-nums" style={{ color: C.accent }}>
                                                ${n.cost_per_beneficiary?.toFixed(2)}/ben
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {!result && !error && !loading && (
                    <div className="h-full flex flex-col items-center justify-center py-12" style={{ color: C.textMuted }}>
                        <svg className="w-10 h-10 mb-3 opacity-15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <p className="text-sm text-center max-w-[200px] leading-relaxed">
                            Search for a project or keyword to find similar high-ROI interventions.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
