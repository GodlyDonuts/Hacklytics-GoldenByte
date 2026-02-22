"use client";

import { useState, useEffect } from "react";
import { benchmarkProject, BenchmarkResponse, BenchmarkNeighbor } from "@/lib/api";

export default function ActianBenchmark({
    onClose
}: {
    onClose?: () => void
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
        <div className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] transition-colors duration-[600ms] rounded-xl flex flex-col h-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b transition-colors duration-[600ms] flex justify-between items-center" style={{ borderColor: 'var(--phase-border)', backgroundColor: 'var(--phase-bg)' }}>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--phase-accent)' }} />
                    <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--phase-text)' }}>
                        Actian VectorDB Benchmark
                    </h3>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
                        ✕
                    </button>
                )}
            </div>

            <div className="p-4 border-b transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)', backgroundColor: 'rgba(var(--phase-bg-rgb, 13, 17, 23), 0.5)' }}>
                <label className="block text-xs mb-2 uppercase tracking-wide" style={{ color: 'var(--phase-text-muted)' }}>
                    Target Query
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={projectCode}
                        onChange={(e) => setProjectCode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleBenchmark()}
                        placeholder="e.g. Afghanistan, Health, or CBPF-AFG-24..."
                        className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors focus:ring-1 font-mono"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'var(--phase-border)', color: 'var(--phase-text)' }}
                    />
                    <button
                        onClick={handleBenchmark}
                        disabled={loading || !projectCode.trim()}
                        className="px-4 py-2 border disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
                        style={{ backgroundColor: 'rgba(45, 212, 168, 0.1)', borderColor: 'var(--phase-accent)', color: 'var(--phase-accent)' }}
                    >
                        {loading ? "Searching..." : "Vector Search"}
                    </button>
                </div>
                <p className="text-[10px] mt-2" style={{ color: 'var(--phase-text-muted)' }}>
                    Searches 8,000+ embedded OCHA projects for high-ROI comparisons using Actian similarity search.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 transition-colors duration-[600ms]" style={{ backgroundColor: 'var(--phase-bg)' }}>
                {error && (
                    <div className="p-3 border rounded-lg text-red-400 text-xs" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                        {error}
                    </div>
                )}

                {result && (
                    <div className="space-y-4">
                        <div className="p-3 border rounded-lg transition-colors duration-[600ms]" style={{ backgroundColor: 'var(--phase-bg-surface)', borderColor: 'var(--phase-border)' }}>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--phase-text-muted)' }}>Target Match</h4>
                            <div className="text-sm font-medium" style={{ color: 'var(--phase-text)' }}>
                                {result.query_project.project_name || result.query_project.project_code}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--phase-text-muted)' }}>
                                <span>Cluster: <span style={{ color: 'var(--phase-text)' }}>{result.query_project.cluster}</span></span>
                                <span>B2B: <span style={{ color: 'var(--phase-accent)' }}>${result.query_project.cost_per_beneficiary?.toFixed(2)}</span> / ben</span>
                            </div>
                        </div>

                        {result.insight && (
                            <div className="p-3 border rounded-lg transition-colors duration-[600ms]" style={{ backgroundColor: 'rgba(155, 109, 255, 0.1)', borderColor: 'var(--phase-accent-secondary)' }}>
                                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--phase-accent-secondary)' }}>
                                    <span className="text-lg">✨</span> OpenRouter Analysis
                                </h4>
                                <p className="text-xs leading-relaxed" style={{ color: 'var(--phase-text)' }}>
                                    {result.insight}
                                </p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--phase-text-muted)' }}>
                                Top Value Comparables ({result.neighbors.length})
                            </h4>
                            <div className="space-y-2">
                                {result.neighbors.map((n, i) => (
                                    <div key={n.project_code || i} className="p-3 border border-transparent transition-colors rounded-lg group" style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'var(--phase-border)' }}>
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-xs font-medium pr-4 line-clamp-2" style={{ color: 'var(--phase-text)' }}>
                                                {n.project_name || n.project_code}
                                            </div>
                                            <div className="text-xs font-mono px-1.5 py-0.5 rounded border transition-colors duration-[600ms]" style={{ color: 'var(--phase-accent)', backgroundColor: 'rgba(45, 212, 168, 0.1)', borderColor: 'var(--phase-accent)' }}>
                                                {((n.similarity_score ?? 0) * 100).toFixed(1)}% Sim
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--phase-text-muted)' }}>
                                            <span className="font-mono px-1.5 rounded" style={{ color: 'var(--phase-text)', backgroundColor: 'var(--phase-border)' }}>{n.iso3}</span>
                                            <span>{n.cluster}</span>
                                            <span className="ml-auto font-mono text-xs" style={{ color: 'var(--phase-accent)' }}>
                                                ${n.cost_per_beneficiary?.toFixed(2)} / ben
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {!result && !error && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-sm py-12" style={{ color: 'var(--phase-text-muted)' }}>
                        <svg className="w-12 h-12 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p className="text-center max-w-[200px]">
                            Enter a search query or a project code to find historically successful interventions with high ROI.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
