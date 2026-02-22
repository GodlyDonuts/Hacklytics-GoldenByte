"use client";

import { useEffect, useState, useMemo } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ScatterChart, Scatter, LineChart, Line, ComposedChart, Area
} from "recharts";
import { getGlobeCrises, askQuestion, type GlobeCountry } from "@/lib/api";
import ActianBenchmark from "./ActianBenchmark";

const CHART_COLORS = [
    "#00d4ff", "#7C3AED", "#DB2777", "#D97706", "#059669",
    "#0891B2", "#DC2626", "#65A30D"
];

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Custom Tooltip Styles for Dark Terminal Look
const tooltipStyle = {
    backgroundColor: "rgba(13, 17, 23, 0.9)",
    borderColor: "#30363d",
    color: "#c9d1d9",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.5)",
    fontFamily: "monospace",
    fontSize: "12px",
};

interface DashboardProps {
    className?: string;
    year?: number;
}

export default function DatabricksDashboard({
    className = "",
    year = 2024,
}: DashboardProps) {
    const [countries, setCountries] = useState<GlobeCountry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [year]);

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const crisesRes = await getGlobeCrises(year);
            setCountries(crisesRes.countries);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const metrics = useMemo(() => {
        const allCrises = countries.flatMap((c) => c.crises);
        const totalPeopleInNeed = allCrises.reduce((sum, c) => sum + (c.people_in_need ?? 0), 0);
        const totalFundingGap = allCrises.reduce((sum, c) => sum + (c.funding_gap_usd ?? 0), 0);
        const totalRequested = allCrises.reduce((sum, c) => sum + ((c.funding_gap_usd ?? 0) / (1 - (c.funding_coverage_pct ?? 0) / 100 || 1)), 0);

        let avgHri = 0;
        let validHri = 0;
        allCrises.forEach(c => {
            if (c.oversight_score != null) {
                avgHri += c.oversight_score;
                validHri++;
            }
        });

        return {
            totalCountries: countries.length,
            totalPeopleInNeed,
            totalFundingGap,
            avgHri: validHri > 0 ? (avgHri / validHri) : 0,
            activeCrises: allCrises.length
        };
    }, [countries]);

    // Data for Capital Gap Scatter (Gap vs Severity)
    const scatterData = useMemo(() => {
        return countries.flatMap((c) =>
            c.crises.map((crisis) => ({
                x: crisis.acaps_severity ?? 0,
                y: crisis.funding_gap_usd ?? 0,
                z: crisis.people_in_need ?? 0,
                name: c.country_name,
                severity: crisis.severity_class,
            }))
        ).filter(d => d.y > 0);
    }, [countries]);

    // Data for Humanitarian Risk Index (HRI) - Top 15 by Oversight Score
    const hriData = useMemo(() => {
        return countries.flatMap(c => c.crises.map(crisis => ({
            name: c.iso3,
            fullName: c.country_name,
            crisisName: crisis.crisis_name,
            hri: crisis.oversight_score ?? 0, // Oversight score maps to HRI
            volatility: (100 - (crisis.funding_coverage_pct ?? 0)) / 100, // Inverse of coverage
            gap: crisis.funding_gap_usd ?? 0
        }))).sort((a, b) => b.hri - a.hri).slice(0, 15);
    }, [countries]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] bg-[#0d1117] ${className}`}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-sm font-mono text-blue-400">CONNECTING TO ACTIAN VECTOR DB...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] bg-[#0d1117] ${className}`}>
                <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-8 text-center max-w-md font-mono">
                    <p className="text-sm text-red-500 mb-2">[SYS_ERR] CONNECTION FAILED</p>
                    <p className="text-xs text-red-400/70">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[#0d1117] text-gray-300 p-6 font-sans ${className}`}>
            <div className="max-w-[1600px] mx-auto space-y-6">

                {/* Header Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                        { label: "ACTIVE ZONES", value: metrics.totalCountries, color: "text-blue-400" },
                        { label: "CRISIS VECTORS", value: metrics.activeCrises, color: "text-purple-400" },
                        { label: "CAPITAL REQUIRED", value: "$" + formatCompact(metrics.totalFundingGap), color: "text-red-400" },
                        { label: "POP. IMPACTED", value: formatCompact(metrics.totalPeopleInNeed), color: "text-orange-400" },
                        { label: "GLOBAL HRI AVG", value: (metrics.avgHri * 100).toFixed(1), color: "text-green-400" },
                    ].map((m, i) => (
                        <div key={i} className="bg-[#161b22] border border-[#30363d] p-4 rounded-xl flex flex-col justify-center">
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{m.label}</p>
                            <p className={`text-2xl font-bold tracking-tight font-mono ${m.color}`}>{m.value}</p>
                        </div>
                    ))}
                </div>

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[800px]">

                    {/* Left & Center Columns: Charts */}
                    <div className="xl:col-span-2 space-y-6 flex flex-col h-full">

                        {/* Capital Gap Scatter */}
                        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex-1 min-h-[350px] shadow-2xl flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500" />
                                    Quantitative Capital Gap Matrix
                                </h3>
                                <div className="text-[10px] text-gray-500 border border-[#30363d] px-2 py-1 rounded bg-black/20">
                                    Y: GAP (USD) | X: SEVERITY (0-5)
                                </div>
                            </div>
                            <div className="flex-1 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                                        <XAxis
                                            dataKey="x"
                                            type="number"
                                            domain={[0, 5]}
                                            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
                                            axisLine={{ stroke: "#30363d" }}
                                            tickLine={{ stroke: "#30363d" }}
                                        />
                                        <YAxis
                                            dataKey="y"
                                            type="number"
                                            tickFormatter={formatCompact}
                                            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
                                            axisLine={{ stroke: "#30363d" }}
                                            tickLine={{ stroke: "#30363d" }}
                                            width={60}
                                        />
                                        <Tooltip
                                            cursor={{ strokeDasharray: '3 3', stroke: '#8b949e' }}
                                            contentStyle={tooltipStyle}
                                            formatter={(value: any, name: any) => [
                                                name === 'y' ? `$${formatCompact(value ?? 0)}` : value,
                                                name === 'x' ? 'Severity' : 'Gap'
                                            ]}
                                        />
                                        <Scatter data={scatterData} fill="#00d4ff" fillOpacity={0.6} shape="circle" />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Humanitarian Risk Index (HRI) Combo Chart */}
                        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex-1 min-h-[350px] shadow-2xl flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                                    Humanitarian Risk Index (HRI)
                                </h3>
                                <div className="text-[10px] text-gray-500 border border-[#30363d] px-2 py-1 rounded bg-black/20">
                                    TOP 15 OVERLOOKED CRISES
                                </div>
                            </div>
                            <div className="flex-1 w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={hriData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }}
                                            axisLine={{ stroke: "#30363d" }}
                                            tickLine={{ stroke: "#30363d" }}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            tickFormatter={(val) => (val * 100).toFixed(0)}
                                            tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }}
                                            axisLine={false}
                                            tickLine={false}
                                            domain={[0, 1]}
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            tickFormatter={formatCompact}
                                            tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Bar yAxisId="right" dataKey="gap" name="Funding Gap" fill="#1f6feb" radius={[4, 4, 0, 0]} opacity={0.6} />
                                        <Line yAxisId="left" type="monotone" dataKey="hri" name="HRI (Oversight)" stroke="#ff7b72" strokeWidth={3} dot={{ fill: '#ff7b72', r: 4 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Actian Benchmark Component */}
                    <div className="xl:col-span-1 h-full">
                        <ActianBenchmark />
                    </div>

                </div>
            </div>
        </div>
    );
}
