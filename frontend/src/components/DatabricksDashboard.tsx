"use client";

import { useEffect, useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import { getGlobeCrises, type GlobeCountry } from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
    "Very High": "#FF3B3B",
    "High": "#FF6B6B",
    "Medium": "#FFD93D",
    "Low": "#00DDFF",
    "Very Low": "#00FF88",
};

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

interface MetricCardProps {
    label: string;
    value: string;
    sub?: string;
}

function MetricCard({ label, value, sub }: MetricCardProps) {
    return (
        <div className="bg-white/5 rounded-2xl border border-white/10 p-5 flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-white/40 font-medium">
                {label}
            </span>
            <span className="text-2xl font-bold text-[#00FF88]">{value}</span>
            {sub && <span className="text-xs text-white/30">{sub}</span>}
        </div>
    );
}

interface DatabricksDashboardProps {
    className?: string;
    year?: number;
}

export default function DatabricksDashboard({
    className = "",
    year = 2024,
}: DatabricksDashboardProps) {
    const [countries, setCountries] = useState<GlobeCountry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        getGlobeCrises(year)
            .then((res) => setCountries(res.countries))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [year]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center min-h-[400px] ${className}`}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-[#00FF88]/30 border-t-[#00FF88] rounded-full animate-spin" />
                    <span className="text-sm text-white/40">Loading dashboard data...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center min-h-[400px] ${className}`}>
                <div className="text-center text-red-400">
                    <p className="text-lg font-medium mb-1">Failed to load data</p>
                    <p className="text-sm text-white/40">{error}</p>
                </div>
            </div>
        );
    }

    // Compute metrics
    const totalCountries = countries.length;
    const allCrises = countries.flatMap((c) => c.crises);
    const totalPeopleInNeed = allCrises.reduce(
        (sum, c) => sum + (c.people_in_need ?? 0), 0
    );
    const coverages = allCrises
        .map((c) => c.funding_coverage_pct)
        .filter((v): v is number => v !== null && v > 0);
    const avgCoverage = coverages.length > 0
        ? coverages.reduce((a, b) => a + b, 0) / coverages.length
        : 0;
    const totalFundingGap = allCrises.reduce(
        (sum, c) => sum + (c.funding_gap_usd ?? 0), 0
    );

    // Severity distribution for pie chart
    const severityCounts: Record<string, number> = {};
    for (const country of countries) {
        const maxSeverity = country.crises.reduce<string | null>((best, c) => {
            if (!c.severity_class) return best;
            if (!best) return c.severity_class;
            return (c.acaps_severity ?? 0) > 0 ? c.severity_class : best;
        }, null);
        if (maxSeverity) {
            severityCounts[maxSeverity] = (severityCounts[maxSeverity] ?? 0) + 1;
        }
    }
    const pieData = Object.entries(severityCounts).map(([name, value]) => ({
        name, value,
    }));

    // Top 10 underfunded countries
    const countryGaps = countries.map((c) => ({
        name: c.country_name,
        gap: c.crises.reduce((sum, cr) => sum + (cr.funding_gap_usd ?? 0), 0),
    }))
        .filter((c) => c.gap > 0)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 10);

    return (
        <div className={`space-y-6 ${className}`}>
            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="Countries in Crisis"
                    value={String(totalCountries)}
                    sub={`${year} data`}
                />
                <MetricCard
                    label="People in Need"
                    value={formatCompact(totalPeopleInNeed)}
                />
                <MetricCard
                    label="Avg Funding Coverage"
                    value={`${avgCoverage.toFixed(1)}%`}
                />
                <MetricCard
                    label="Total Funding Gap"
                    value={`$${formatCompact(totalFundingGap)}`}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Severity Distribution */}
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                    <h3 className="text-xs uppercase tracking-wider text-white/50 mb-4 font-semibold">
                        Severity Distribution
                    </h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={100}
                                    dataKey="value"
                                    label={({ name, value }: { name?: string; value?: number }) => `${name ?? ""}: ${value ?? ""}`}
                                    labelLine={{ stroke: "rgba(255,255,255,0.2)" }}
                                >
                                    {pieData.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={SEVERITY_COLORS[entry.name] ?? "#888"}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                    itemStyle={{ color: "#fff" }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top 10 Underfunded */}
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                    <h3 className="text-xs uppercase tracking-wider text-white/50 mb-4 font-semibold">
                        Top 10 Underfunded Countries
                    </h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={countryGaps}
                                layout="vertical"
                                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    type="number"
                                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                                    tickFormatter={formatCompact}
                                />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 10 }}
                                    width={90}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(v: number | undefined) => `$${formatCompact(v ?? 0)}`}
                                />
                                <Bar dataKey="gap" fill="#FF6B6B" radius={[0, 4, 4, 0]} barSize={18} name="Funding Gap" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
