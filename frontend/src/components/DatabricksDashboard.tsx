"use client";

import { useEffect, useState, useMemo } from "react";
import {
    Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ScatterChart, Scatter, Line, ComposedChart, Area,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart
} from "recharts";
import { getGlobeCrises, type GlobeCountry } from "@/lib/api";
import ActianBenchmark from "./ActianBenchmark";

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

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const tooltipStyle: React.CSSProperties = {
    backgroundColor: C.elevated,
    borderColor: C.border,
    color: C.text,
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    fontSize: "12px",
    padding: "8px 12px",
};

const axisTickStyle = {
    fill: C.textMuted,
    fontSize: 11,
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

    const hriData = useMemo(() => {
        return countries.flatMap(c => c.crises.map(crisis => ({
            name: c.iso3,
            fullName: c.country_name,
            crisisName: crisis.crisis_name,
            hri: crisis.oversight_score ?? 0,
            volatility: (100 - (crisis.funding_coverage_pct ?? 0)) / 100,
            gap: crisis.funding_gap_usd ?? 0
        }))).sort((a, b) => b.hri - a.hri).slice(0, 15);
    }, [countries]);

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

    const radarData = useMemo(() => {
        const clusterMap = new Map<string, { severity: number; gap: number; count: number }>();
        countries.forEach(c => {
            c.crises.forEach(cr => {
                const type = cr.severity_class || "Unknown";
                const curr = clusterMap.get(type) || { severity: 0, gap: 0, count: 0 };
                curr.severity += (cr.acaps_severity ?? 0);
                curr.gap += (cr.funding_gap_usd ?? 0);
                curr.count += 1;
                clusterMap.set(type, curr);
            });
        });
        const arr = Array.from(clusterMap.entries()).map(([subject, stats]) => ({
            subject: subject.slice(0, 15),
            severityScale: (stats.severity / stats.count) * 20,
            gapScale: Math.min(100, (stats.gap / 1_000_000_000) * 10),
            fullMark: 100
        }));
        return arr.slice(0, 6);
    }, [countries]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] ${className}`} style={{ backgroundColor: C.bg }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: C.border, borderTopColor: C.accent }} />
                    <p className="text-sm" style={{ color: C.textMuted }}>Loading crisis data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] ${className}`} style={{ backgroundColor: C.bg }}>
                <div className="rounded-lg p-8 text-center max-w-md border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                    <p className="text-sm font-medium text-red-400 mb-2">Unable to load data</p>
                    <p className="text-xs leading-relaxed" style={{ color: C.textMuted }}>{error}</p>
                    <button
                        onClick={() => loadData()}
                        className="mt-4 px-4 py-1.5 text-xs font-medium rounded-md transition-colors"
                        style={{ backgroundColor: C.elevated, color: C.text }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const metricCards = [
        { label: "Countries affected", value: String(metrics.totalCountries) },
        { label: "Active crises", value: String(metrics.activeCrises) },
        { label: "Funding gap", value: "$" + formatCompact(metrics.totalFundingGap), accent: true },
        { label: "People in need", value: formatCompact(metrics.totalPeopleInNeed) },
        { label: "Avg. oversight score", value: (metrics.avgHri * 100).toFixed(1) },
    ];

    return (
        <div className={className} style={{ backgroundColor: C.bg, color: C.text }}>
            <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-8 space-y-8">

                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {metricCards.map((m, i) => (
                        <div
                            key={i}
                            className="rounded-lg p-4 border"
                            style={{ backgroundColor: C.surface, borderColor: C.border }}
                        >
                            <p className="text-[11px] font-medium mb-1.5" style={{ color: C.textMuted }}>
                                {m.label}
                            </p>
                            <p
                                className="text-2xl font-semibold tracking-tight tabular-nums"
                                style={{ color: m.accent ? C.accent : C.text }}
                            >
                                {m.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Charts grid */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* Left column: main charts */}
                    <div className="xl:col-span-2 space-y-6 flex flex-col">

                        <ChartCard title="Funding Gap vs. Severity" subtitle="Each point represents a crisis, sized by affected population.">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 16, right: 16, bottom: 32, left: 24 }}>
                                    <defs>
                                        <filter id="glow">
                                            <feGaussianBlur stdDeviation="2.5" result="blur" />
                                            <feMerge>
                                                <feMergeNode in="blur" />
                                                <feMergeNode in="SourceGraphic" />
                                            </feMerge>
                                        </filter>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                                    <XAxis
                                        dataKey="x"
                                        type="number"
                                        domain={[0, 5]}
                                        name="Severity"
                                        tick={axisTickStyle}
                                        axisLine={{ stroke: C.border }}
                                        tickLine={false}
                                        label={{ value: "ACAPS Severity", position: "insideBottom", offset: -18, style: { fill: C.textSecondary, fontSize: 11 } }}
                                    />
                                    <YAxis
                                        dataKey="y"
                                        type="number"
                                        name="Funding Gap"
                                        tickFormatter={formatCompact}
                                        tick={axisTickStyle}
                                        axisLine={false}
                                        tickLine={false}
                                        width={64}
                                        label={{ value: "Funding Gap (USD)", angle: -90, position: "insideLeft", offset: -8, style: { fill: C.textSecondary, fontSize: 11 } }}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: "3 3", stroke: C.textMuted }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div style={tooltipStyle}>
                                                    <p style={{ color: C.accent, fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
                                                    <p style={{ color: C.text, fontSize: 11 }}>Severity: <span style={{ color: C.accent }}>{d.x.toFixed(1)}</span></p>
                                                    <p style={{ color: C.text, fontSize: 11 }}>Funding gap: <span style={{ color: C.accentSecondary }}>${formatCompact(d.y)}</span></p>
                                                    {d.z > 0 && <p style={{ color: C.text, fontSize: 11 }}>People in need: {formatCompact(d.z)}</p>}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Scatter
                                        data={scatterData}
                                        fill={C.accent}
                                        fillOpacity={0.65}
                                        stroke={C.accent}
                                        strokeOpacity={0.3}
                                        strokeWidth={4}
                                        shape={(props: any) => {
                                            const r = Math.max(4, Math.min(14, Math.sqrt((props.payload?.z ?? 0) / 100000)));
                                            return <circle cx={props.cx} cy={props.cy} r={r} fill={C.accent} fillOpacity={0.65} stroke={C.accent} strokeOpacity={0.25} strokeWidth={r * 0.6} filter="url(#glow)" />;
                                        }}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Oversight Risk Index" subtitle="Top 15 most overlooked crises by oversight score, overlaid with their funding gaps.">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={hriData} margin={{ top: 16, right: 16, bottom: 16, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={axisTickStyle}
                                        axisLine={{ stroke: C.border }}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        tickFormatter={(val) => (val * 100).toFixed(0)}
                                        tick={axisTickStyle}
                                        axisLine={false}
                                        tickLine={false}
                                        domain={[0, 1]}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        tickFormatter={formatCompact}
                                        tick={axisTickStyle}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Bar yAxisId="right" dataKey="gap" name="Funding Gap" fill={C.accentSecondary} radius={[3, 3, 0, 0]} opacity={0.5} />
                                    <Line yAxisId="left" type="monotone" dataKey="hri" name="Oversight Score" stroke={C.accent} strokeWidth={2} dot={{ fill: C.accent, r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Funding Allocation by Region" subtitle="Top 15 countries by total requirements, showing funded portion vs. remaining gap.">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={areaData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradFunded" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={C.accent} stopOpacity={0.6} />
                                            <stop offset="95%" stopColor={C.accent} stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="gradGap" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={C.accentSecondary} stopOpacity={0.6} />
                                            <stop offset="95%" stopColor={C.accentSecondary} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="name"
                                        tick={axisTickStyle}
                                        axisLine={{ stroke: C.border }}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tickFormatter={formatCompact}
                                        tick={axisTickStyle}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => `$${formatCompact(val ?? 0)}`} />
                                    <Area type="monotone" dataKey="funded" stroke={C.accent} fillOpacity={1} fill="url(#gradFunded)" stackId="1" name="Funded" />
                                    <Area type="monotone" dataKey="gap" stroke={C.accentSecondary} fillOpacity={1} fill="url(#gradGap)" stackId="1" name="Unfunded" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    {/* Right column: benchmark + radar */}
                    <div className="xl:col-span-1 flex flex-col gap-6">
                        <ActianBenchmark />

                        <ChartCard title="Crisis Type Breakdown" subtitle="Average severity and cumulative funding gaps by crisis category.">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                                    <PolarGrid stroke={C.border} />
                                    <PolarAngleAxis dataKey="subject" tick={axisTickStyle} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name="Severity" dataKey="severityScale" stroke={C.accent} fill={C.accent} fillOpacity={0.5} />
                                    <Radar name="Funding Gap" dataKey="gapScale" stroke={C.accentSecondary} fill={C.accentSecondary} fillOpacity={0.3} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ChartCard({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className="rounded-lg border p-5 flex-1 min-h-[340px] flex flex-col"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
            <div className="mb-4">
                <h3
                    className="text-sm font-semibold tracking-[-0.01em]"
                    style={{ color: C.text }}
                >
                    {title}
                </h3>
                {subtitle && (
                    <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: C.textMuted }}>
                        {subtitle}
                    </p>
                )}
            </div>
            <div className="flex-1 w-full min-h-0">
                {children}
            </div>
        </div>
    );
}
