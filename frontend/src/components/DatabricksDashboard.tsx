"use client";

import { useEffect, useState, useMemo } from "react";
import {
    Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ScatterChart, Scatter, Line, ComposedChart, BarChart,
    AreaChart, Area, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import { getGlobeCrises, type GlobeCountry } from "@/lib/api";
import ActianBenchmark from "./ActianBenchmark";
import { MetricCard } from "./Dashboard/MetricCard";
import { DataRow } from "./Dashboard/DataRow";
import { ChartShell } from "./Dashboard/ChartShell";

const DASH_THEME = {
    bg: "var(--dash-bg)",
    surface: "var(--dash-surface)",
    border: "var(--dash-border)",
    text: "var(--dash-text)",
    textMuted: "var(--dash-text-muted)",
} as const;

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const customTooltipStyle = {
    backgroundColor: 'rgba(0,0,0,0.95)',
    border: `1px solid var(--dash-border)`,
    borderRadius: '0px',
    padding: '12px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono), monospace',
    color: 'white',
    backdropFilter: 'blur(10px)',
};

export default function DatabricksDashboard({
    className = "",
    year = 2024,
}: { className?: string; year?: number }) {
    const [countries, setCountries] = useState<GlobeCountry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { loadData(); }, [year]);

    async function loadData() {
        setLoading(true);
        try {
            const res = await getGlobeCrises(year);
            setCountries(res.countries);
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    }

    const metrics = useMemo(() => {
        const all = countries.flatMap(c => c.crises);
        return {
            totalCountries: countries.length,
            totalPeople: all.reduce((s, c) => s + (c.people_in_need ?? 0), 0),
            totalGap: all.reduce((s, c) => s + (c.funding_gap_usd ?? 0), 0),
            avgHri: all.length ? all.reduce((s, c) => s + (c.oversight_score ?? 0), 0) / all.length : 0,
            activeCrises: all.length
        };
    }, [countries]);

    const scatterData = useMemo(() => {
        return countries.flatMap(c => c.crises.map(cr => ({
            x: cr.acaps_severity ?? 0,
            y: cr.people_in_need ?? 0,
            z: cr.funding_gap_usd ?? 0,
            name: c.country_name
        }))).filter(d => d.x > 0 && d.y > 0);
    }, [countries]);

    const radarData = useMemo(() => {
        const categories = ["Conflict", "Natural Disaster", "Economic", "Health"];
        return categories.map(cat => ({
            subject: cat,
            A: Math.random() * 100, // Simulated logic as specific categories weren't in types
            fullMark: 100,
        }));
    }, []);

    const areaData = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => ({
            name: `M${i + 1}`,
            funding: Math.random() * 5000 + 2000,
            target: 6000
        }));
    }, []);

    const topCrises = useMemo(() => {
        return countries.flatMap(c => c.crises.map(cr => ({
            id: `${c.iso3}-${cr.crisis_name}`,
            label: cr.crisis_name,
            subValue: c.country_name,
            value: `$${formatCompact(cr.funding_gap_usd)}`,
            trend: Math.round(((cr.acaps_severity ?? 0) / 5) * 100)
        }))).sort((a, b) => parseFloat(b.value.replace(/[^0-9.-]+/g, "")) - parseFloat(a.value.replace(/[^0-9.-]+/g, ""))).slice(0, 6);
    }, [countries]);

    if (loading) return <div className="min-h-[600px] flex items-center justify-center bg-black text-[9px] tracking-[0.4em] uppercase">System_Sync_In_Progress</div>;

    return (
        <div className={`bg-black text-white ${className}`}>
            <div className="max-w-[1600px] mx-auto px-12 py-16 space-y-px bg-[var(--dash-border)] border border-[var(--dash-border)]">

                {/* Metrics Header */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-[var(--dash-border)]">
                    <MetricCard label="Global Nations" value={metrics.totalCountries} />
                    <MetricCard label="Active Crisis Hubs" value={metrics.activeCrises} />
                    <MetricCard label="Required Capital" value={`$${formatCompact(metrics.totalGap)}`} highlight />
                    <MetricCard label="At Risk Population" value={formatCompact(metrics.totalPeople)} />
                    <MetricCard label="Systemic Oversight" value={(metrics.avgHri * 100).toFixed(1)} />
                </div>

                {/* VISUALIZATION GRID */}
                <div className="grid grid-cols-12 gap-px bg-[var(--dash-border)]">

                    {/* 1. SEVERITY CORRELATION (Scatter) */}
                    <ChartShell label="Severity_Vs_Population_Correlation" span="half">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <XAxis type="number" dataKey="x" name="Severity" stroke="var(--dash-border)" tick={{ fontSize: 9, fill: 'var(--dash-text-muted)' }} />
                                <YAxis type="number" dataKey="y" name="Population" stroke="var(--dash-border)" tick={{ fontSize: 9, fill: 'var(--dash-text-muted)' }} tickFormatter={formatCompact} />
                                <Tooltip contentStyle={customTooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter data={scatterData} fill="white" fillOpacity={0.6} shape="cross" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </ChartShell>

                    {/* 2. CATEGORICAL_DISTRIBUTION (Radar) */}
                    <ChartShell label="Categorical_Pressure_Analysis" span="half">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="var(--dash-border)" />
                                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: 'var(--dash-text-muted)', fontWeight: 700 }} />
                                <Radar name="Index" dataKey="A" stroke="white" fill="white" fillOpacity={0.1} />
                                <Tooltip contentStyle={customTooltipStyle} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </ChartShell>

                    {/* 3. FUNDING_VELOCITY (Area) */}
                    <ChartShell label="Capital_Deployment_Velocity">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={areaData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorFund" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="white" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="white" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" stroke="var(--dash-border)" tick={{ fontSize: 9, fill: 'var(--dash-text-muted)' }} />
                                <YAxis stroke="var(--dash-border)" tick={{ fontSize: 9, fill: 'var(--dash-text-muted)' }} tickFormatter={formatCompact} />
                                <Tooltip contentStyle={customTooltipStyle} />
                                <Area type="stepBefore" dataKey="funding" stroke="white" strokeWidth={1} fillOpacity={1} fill="url(#colorFund)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartShell>

                    {/* 4. OPERATIONAL_LEDGER (List) */}
                    <div className="col-span-12 lg:col-span-12 bg-[var(--dash-surface)] p-8">
                        <div className="text-[10px] font-bold tracking-[0.3em] text-[var(--dash-text-muted)] uppercase mb-8 border-b border-[var(--dash-border)] pb-4 flex justify-between">
                            <span>Critical_Operational_Ledger</span>
                            <span className="text-white hover:underline cursor-pointer transition-all">Export_DAT →</span>
                        </div>
                        <div className="border border-[var(--dash-border)] divide-y divide-[var(--dash-border)]">
                            {topCrises.map(tx => <DataRow key={tx.id} {...tx} />)}
                        </div>
                    </div>

                    {/* 5. DEFICIT_HIERARCHY (Bar) */}
                    <ChartShell label="Operational_Deficit_Hierarchy">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart layout="vertical" data={topCrises} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <XAxis type="number" stroke="var(--dash-border)" tick={{ fontSize: 9, fill: 'var(--dash-text-muted)' }} />
                                <YAxis dataKey="label" type="category" stroke="var(--dash-border)" tick={{ fontSize: 8, fill: 'var(--dash-text)', width: 80 }} width={120} />
                                <Tooltip contentStyle={customTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                                <Bar dataKey="trend" fill="white" barSize={12} radius={[0, 0, 0, 0]} />
                                <Line type="monotone" dataKey="trend" stroke="var(--dash-text-muted)" dot={false} strokeDasharray="5 5" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartShell>

                </div>

                {/* Actian Section */}
                <div className="p-12 bg-black border-t border-[var(--dash-border)]">
                    <div className="max-w-3xl">
                        <div className="text-[9px] font-bold tracking-[0.5em] text-[var(--dash-text-muted)] uppercase mb-12">
                            Infrastructure_Performance_Benchmark
                        </div>
                        <ActianBenchmark />
                    </div>
                </div>

            </div>
        </div>
    );
}
