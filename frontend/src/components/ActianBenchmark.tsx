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
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col h-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[#30363d] flex justify-between items-center bg-[#0d1117]">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-widest">
                        Actian VectorDB Benchmark
                    </h3>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
                        ✕
                    </button>
                )}
            </div>

            <div className="p-4 border-b border-[#30363d] bg-[#0d1117]/50">
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">
                    Target Project Code
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={projectCode}
                        onChange={(e) => setProjectCode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleBenchmark()}
                        placeholder="e.g. CBPF-AFG-24-S-NGO-27663"
                        className="flex-1 bg-black/50 border border-[#30363d] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                    <button
                        onClick={handleBenchmark}
                        disabled={loading || !projectCode.trim()}
                        className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-600/40 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
                    >
                        {loading ? "Searching..." : "Vector Search"}
                    </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                    Searches 8,000+ embedded OCHA projects for high-ROI comparisons using Actian similarity search.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117]">
                {error && (
                    <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-xs">
                        {error}
                    </div>
                )}

                {result && (
                    <div className="space-y-4">
                        <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Query Project</h4>
                            <div className="text-sm text-gray-300 font-medium">
                                {result.query_project.project_name || result.query_project.project_code}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <span>Cluster: <span className="text-gray-300">{result.query_project.cluster}</span></span>
                                <span>B2B: <span className="text-blue-400">${result.query_project.cost_per_beneficiary?.toFixed(2)}</span> / ben</span>
                            </div>
                        </div>

                        {result.insight && (
                            <div className="p-3 bg-blue-900/10 border border-blue-500/30 rounded-lg">
                                <h4 className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                                    <span className="text-lg">✨</span> Gemini Analysis
                                </h4>
                                <p className="text-xs text-gray-300 leading-relaxed">
                                    {result.insight}
                                </p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Top Value Comparables ({result.neighbors.length})
                            </h4>
                            <div className="space-y-2">
                                {result.neighbors.map((n, i) => (
                                    <div key={n.project_code || i} className="p-3 bg-black/40 border border-[#30363d] hover:border-gray-500 transition-colors rounded-lg group">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-xs font-medium text-gray-300 pr-4 line-clamp-2">
                                                {n.project_name || n.project_code}
                                            </div>
                                            <div className="text-xs font-mono text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded border border-green-400/20">
                                                {((n.similarity_score ?? 0) * 100).toFixed(1)}% Sim
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                            <span className="font-mono text-gray-400 px-1.5 rounded bg-[#30363d]">{n.iso3}</span>
                                            <span>{n.cluster}</span>
                                            <span className="ml-auto text-blue-400 font-mono text-xs">
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
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm py-12">
                        <svg className="w-12 h-12 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p className="text-center max-w-[200px]">
                            Enter a project code to find historically successful interventions with high ROI.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
