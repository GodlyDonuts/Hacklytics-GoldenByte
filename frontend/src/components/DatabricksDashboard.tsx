"use client";

import { useEffect, useState, useMemo } from "react";
import {
    Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ScatterChart, Scatter, Line, ComposedChart, BarChart
} from "recharts";
import { getGlobeCrises, type GlobeCountry } from "@/lib/api";
import ActianBenchmark from "./ActianBenchmark";
import { MetricCard } from "./Dashboard/MetricCard";
import { DataRow } from "./Dashboard/DataRow";

const DASH_THEME = {
    bg: "var(--dash-bg)",
    surface: "var(--dash-surface)",
    border: "var(--dash-border)",
    text: "var(--dash-text)",
    textMuted: "var(--dash-text-muted)",
    sage: "var(--dash-sage)",
    terracotta: "var(--dash-terracotta)",
} as const;

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const customTooltipStyle = {
    backgroundColor: DASH_THEME.surface,
    border: `1px solid ${DASH_THEME.border}`,
    borderRadius: '0px',
    padding: '12px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono), monospace',
    color: DASH_THEME.text,
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
        return {
            totalCountries: countries.length,
            totalPeopleInNeed: allCrises.reduce((sum, c) => sum + (c.people_in_need ?? 0), 0),
            totalFundingGap: allCrises.reduce((sum, c) => sum + (c.funding_gap_usd ?? 0), 0),
            avgHri: allCrises.filter(c => c.oversight_score != null).reduce((sum, c, _, arr) => sum + (c.oversight_score ?? 0) / arr.length, 0),
            activeCrises: allCrises.length
        };
    }, [countries]);

    const topCrises = useMemo(() => {
        return countries
            .flatMap(c => c.crises.map(cr => ({
                id: `${c.iso3}-${cr.crisis_name}`,
                label: cr.crisis_name,
                subValue: c.country_name,
                value: `$${formatCompact(cr.funding_gap_usd)}`,
                trend: Math.round(((cr.acaps_severity ?? 0) / 5) * 100)
            })))
            .sort((a, b) => parseFloat(b.value.replace(/[^0-9.-]+/g, "")) - parseFloat(a.value.replace(/[^0-9.-]+/g, "")))
            .slice(0, 8);
    }, [countries]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[600px] bg-black">
                <div className="text-[10px] uppercase font-bold tracking-[0.4em] text-white animate-pulse">
                    SYSTEM_INITIALIZING
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-black text-white selection:bg-white selection:text-black ${className}`}>
            <div className="max-w-[1600px] mx-auto px-12 py-16 space-y-20">

                {/* Header Section */}
                <header className="flex justify-between items-end border-b border-[var(--dash-border)] pb-8">
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold tracking-[0.3em] text-[var(--dash-text-muted)] uppercase">
                            CRISIS_TOPOGRAPHY_V4.0
                        </div>
                        <h2 className="text-3xl font-medium tracking-tighter uppercase">Global Statistics</h2>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--dash-text-muted)] uppercase">
                        Reporting Year: {year} // Status: Active
                    </div>
                </header>

                {/* Grid 1: Metrics */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-px bg-[var(--dash-border)] border border-[var(--dash-border)]">
                    <MetricCard label="Affected Nations" value={metrics.totalCountries} />
                    <MetricCard label="Active Operations" value={metrics.activeCrises} />
                    <MetricCard label="Funding Deficit" value={`$${formatCompact(metrics.totalFundingGap)}`} highlight />
                    <MetricCard label="Population in Need" value={formatCompact(metrics.totalPeopleInNeed)} />
                    <MetricCard label="Oversight Index" value={(metrics.avgHri * 100).toFixed(1)} />
                </section>

                {/* Grid 2: Analysis & Ledger */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">

                    {/* Left: Crisis Ledger */}
                    <div className="lg:col-span-12">
                        <div className="flex justify-between items-end mb-8 border-b border-[var(--dash-border)] pb-4">
                            <div className="text-[10px] font-bold tracking-[0.3em] text-[var(--dash-text-muted)] uppercase">
                                CRISIS_LEDGER_DATA
                            </div>
                            <div className="text-[10px] font-mono text-[var(--dash-text-muted)] hover:text-white cursor-pointer transition-colors">
                                EXPORT_RAW_JSON →
                            </div>
                        </div>
                        <div className="border border-[var(--dash-border)] bg-[var(--dash-surface)]">
                            <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-6 py-3 bg-white/[0.03] border-b border-[var(--dash-border)] text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">
                                <div>Operational Arena</div>
                                <div className="text-right">Deficit (USD)</div>
                                <div className="text-right">Severity %</div>
                            </div>
                            <div className="divide-y divide-[var(--dash-border)]">
                                {topCrises.map(crisis => (
                                    <DataRow key={crisis.id} {...crisis} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chart Section: Aggressive Minimalism */}
                <section className="space-y-8">
                    <div className="text-[10px] font-bold tracking-[0.3em] text-[var(--dash-text-muted)] uppercase">
                        SEVERITY_DISTRIBUTION_ALGORITHM
                    </div>
                    <div className="h-[400px] w-full border border-[var(--dash-border)] bg-[var(--dash-surface)] p-8">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCrises} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                                <XAxis
                                    dataKey="label"
                                    stroke="var(--dash-border)"
                                    tick={{ fill: 'var(--dash-text-muted)', fontSize: 9, fontWeight: 700 }}
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                />
                                <YAxis
                                    stroke="var(--dash-border)"
                                    tick={{ fill: 'var(--dash-text-muted)', fontSize: 9 }}
                                />
                                <Tooltip
                                    contentStyle={customTooltipStyle}
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                />
                                <Bar
                                    dataKey="trend"
                                    fill="var(--dash-text)"
                                    radius={[0, 0, 0, 0]}
                                    barSize={32}
                                    className="hover:opacity-80 transition-opacity"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Bottom Section: Actian Benchmark in minimalist shell */}
                <footer className="pt-12 border-t border-[var(--dash-border)]">
                    <div className="max-w-2xl">
                        <h3 className="text-lg font-medium tracking-tight uppercase mb-8">Performance Benchmarking</h3>
                        <ActianBenchmark />
                    </div>
                </footer>

            </div>
        </div>
    );
}
