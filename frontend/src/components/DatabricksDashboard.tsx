"use client";

import { useEffect, useState, useMemo } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ScatterChart, Scatter, LineChart, Line, ComposedChart, Area,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart
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
    backgroundColor: "var(--phase-bg-elevated)",
    borderColor: "var(--phase-border)",
    color: "var(--phase-text)",
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

    // Data for Area Chart: Funding vs Gap over Top 10 Countries
    const areaData = useMemo(() => {
        return countries
            .map(c => {
                const totalReq = c.crises.reduce((sum, cr) => sum + ((cr.funding_gap_usd ?? 0) / (1 - (cr.funding_coverage_pct ?? 0) / 100 || 1)), 0);
                const totalGap = c.crises.reduce((sum, cr) => sum + (cr.funding_gap_usd ?? 0), 0);
                return {
                    name: c.iso3,
                    funded: totalReq - totalGap,
                    gap: totalGap,
                    totalReq
                };
            })
            .sort((a, b) => b.totalReq - a.totalReq)
            .slice(0, 15);
    }, [countries]);

    // Data for Radar Chart: Cluster Vulnerabilities globally
    const radarData = useMemo(() => {
        const clusterMap = new Map<string, { severity: number; gap: number; count: number }>();
        countries.forEach(c => {
            c.crises.forEach(cr => {
                const type = cr.crisis_type || "Unknown";
                const curr = clusterMap.get(type) || { severity: 0, gap: 0, count: 0 };
                curr.severity += (cr.acaps_severity ?? 0);
                curr.gap += (cr.funding_gap_usd ?? 0);
                curr.count += 1;
                clusterMap.set(type, curr);
            });
        });
        const arr = Array.from(clusterMap.entries()).map(([subject, stats]) => ({
            subject: subject.slice(0, 15),
            severityScale: (stats.severity / stats.count) * 20, // Scale 0-5 to 0-100
            gapScale: Math.min(100, (stats.gap / 1_000_000_000) * 10), // Scale billions to 100
            fullMark: 100
        }));
        return arr.slice(0, 6);
    }, [countries]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] bg-[var(--phase-bg)] transition-colors duration-[600ms] ${className}`}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-[var(--phase-border)] border-t-[var(--phase-accent)] rounded-full animate-spin" />
                    <p className="text-sm font-mono" style={{ color: 'var(--phase-accent)' }}>CONNECTING TO ACTIAN VECTOR DB...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] bg-[var(--phase-bg)] transition-colors duration-[600ms] ${className}`}>
                <div className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] rounded-lg p-8 text-center max-w-md font-mono">
                    <p className="text-sm text-red-500 mb-2">[SYS_ERR] CONNECTION FAILED</p>
                    <p className="text-xs" style={{ color: 'var(--phase-text-muted)' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[var(--phase-bg)] transition-colors duration-[600ms] p-6 font-sans ${className}`} style={{ color: 'var(--phase-text)' }}>
            <div className="max-w-[1600px] mx-auto space-y-6">

                {/* Header Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                        { label: "ACTIVE ZONES", value: metrics.totalCountries, color: "text-blue-400" },
                        { label: "CRISIS VECTORS", value: metrics.activeCrises, color: "text-purple-400" },
                        { label: "CAPITAL REQUIRED", value: "$" + formatCompact(metrics.totalFundingGap), color: "text-red-400" },
                        { label: "POP. IMPACTED", value: formatCompact(metrics.totalPeopleInNeed), color: "text-orange-400" },
                        { label: "GLOBAL HRI AVG", value: (metrics.avgHri * 100).toFixed(1), color: "var(--phase-accent)" },
                    ].map((m, i) => (
                        <div key={i} className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] transition-colors duration-[600ms] p-4 rounded-xl flex flex-col justify-center">
                            <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: 'var(--phase-text-muted)' }}>{m.label}</p>
                            <p className={`text-2xl font-bold tracking-tight font-mono`} style={{ color: m.color }}>{m.value}</p>
                        </div>
                    ))}
                </div>

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* Left & Center Columns: Charts */}
                    <div className="xl:col-span-2 space-y-6 flex flex-col">

                        {/* Capital Gap Scatter */}
                        <div className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] transition-colors duration-[600ms] rounded-xl p-5 flex-1 min-h-[350px] shadow-2xl flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--phase-text)' }}>
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--phase-accent)' }} />
                                    Quantitative Capital Gap Matrix
                                </h3>
                                <div className="text-[10px] border px-2 py-1 rounded transition-colors duration-[600ms]" style={{ color: 'var(--phase-text-muted)', borderColor: 'var(--phase-border)', backgroundColor: 'var(--phase-bg)' }}>
                                    Y: GAP (USD) | X: SEVERITY (0-5)
                                </div>
                            </div>
                            <div className="flex-1 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--phase-border)" vertical={false} />
                                        <XAxis
                                            dataKey="x"
                                            type="number"
                                            domain={[0, 5]}
                                            tick={{ fill: "var(--phase-text-muted)", fontSize: 11, fontFamily: "monospace" }}
                                            axisLine={{ stroke: "var(--phase-border)" }}
                                            tickLine={{ stroke: "var(--phase-border)" }}
                                        />
                                        <YAxis
                                            dataKey="y"
                                            type="number"
                                            tickFormatter={formatCompact}
                                            tick={{ fill: "var(--phase-text-muted)", fontSize: 11, fontFamily: "monospace" }}
                                            axisLine={{ stroke: "var(--phase-border)" }}
                                            tickLine={{ stroke: "var(--phase-border)" }}
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
                                        <Scatter data={scatterData} fill="var(--phase-accent)" fillOpacity={0.6} shape="circle" />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Humanitarian Risk Index (HRI) Combo Chart */}
                        <div className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] transition-colors duration-[600ms] rounded-xl p-5 flex-1 min-h-[350px] shadow-2xl flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--phase-text)' }}>
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--phase-accent-secondary)' }} />
                                    Humanitarian Risk Index (HRI)
                                </h3>
                                <div className="text-[10px] border px-2 py-1 rounded transition-colors duration-[600ms]" style={{ color: 'var(--phase-text-muted)', borderColor: 'var(--phase-border)', backgroundColor: 'var(--phase-bg)' }}>
                                    TOP 15 OVERLOOKED CRISES
                                </div>
                            </div>
                            <div className="flex-1 w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={hriData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--phase-border)" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fill: "var(--phase-text-muted)", fontSize: 10, fontFamily: "monospace" }}
                                            axisLine={{ stroke: "var(--phase-border)" }}
                                            tickLine={{ stroke: "var(--phase-border)" }}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            tickFormatter={(val) => (val * 100).toFixed(0)}
                                            tick={{ fill: "var(--phase-text-muted)", fontSize: 10, fontFamily: "monospace" }}
                                            axisLine={false}
                                            tickLine={false}
                                            domain={[0, 1]}
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            tickFormatter={formatCompact}
                                            tick={{ fill: "var(--phase-text-muted)", fontSize: 10, fontFamily: "monospace" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Bar yAxisId="right" dataKey="gap" name="Funding Gap" fill="var(--phase-accent-secondary)" radius={[4, 4, 0, 0]} opacity={0.6} />
                                        <Line yAxisId="left" type="monotone" dataKey="hri" name="HRI (Oversight)" stroke="var(--phase-accent)" strokeWidth={3} dot={{ fill: 'var(--phase-accent)', r: 4 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Top 15 Funding vs Gap (Area Chart) */}
                        <div className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] transition-colors duration-[600ms] rounded-xl p-5 flex-1 min-h-[350px] shadow-2xl flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--phase-text)' }}>
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--phase-accent)' }} />
                                    Region Funding Tranch vs Gap
                                </h3>
                                <div className="text-[10px] border px-2 py-1 rounded transition-colors duration-[600ms]" style={{ color: 'var(--phase-text-muted)', borderColor: 'var(--phase-border)', backgroundColor: 'var(--phase-bg)' }}>
                                    CUMULATIVE STACK ($)
                                </div>
                            </div>
                            <div className="flex-1 w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={areaData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorFunded" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--phase-accent)" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="var(--phase-accent)" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorGap" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--phase-accent-secondary)" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="var(--phase-accent-secondary)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" tick={{ fill: "var(--phase-text-muted)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--phase-border)" }} tickLine={{ stroke: "var(--phase-border)" }} />
                                        <YAxis tickFormatter={formatCompact} tick={{ fill: "var(--phase-text-muted)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--phase-border)" vertical={false} />
                                        <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `$${formatCompact(val)}`} />
                                        <Area type="monotone" dataKey="funded" stroke="var(--phase-accent)" fillOpacity={1} fill="url(#colorFunded)" stackId="1" name="Funded" />
                                        <Area type="monotone" dataKey="gap" stroke="var(--phase-accent-secondary)" fillOpacity={1} fill="url(#colorGap)" stackId="1" name="Unfunded Gap" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Actian Benchmark Component + Radar */}
                    <div className="xl:col-span-1 flex flex-col gap-6">
                        <ActianBenchmark />

                        {/* Radar Chart: Cluster Vulnerabilities */}
                        <div className="bg-[var(--phase-bg-surface)] border border-[var(--phase-border)] transition-colors duration-[600ms] rounded-xl p-5 shadow-2xl flex flex-col min-h-[400px]">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--phase-text)' }}>
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--phase-accent)' }} />
                                    Cluster Vulnerability Matrix
                                </h3>
                            </div>
                            <div className="flex-1 w-full relative -mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke="var(--phase-border)" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--phase-text-muted)", fontSize: 10, fontFamily: "monospace" }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar name="Severity (Relative)" dataKey="severityScale" stroke="var(--phase-accent)" fill="var(--phase-accent)" fillOpacity={0.6} />
                                        <Radar name="Funding Gap ($B)" dataKey="gapScale" stroke="var(--phase-accent-secondary)" fill="var(--phase-accent-secondary)" fillOpacity={0.4} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
