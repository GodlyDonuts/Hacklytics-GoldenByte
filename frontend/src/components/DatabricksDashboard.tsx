"use client";

import { useEffect, useState, useMemo } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, PieChart, Pie, Cell, ScatterChart, Scatter,
} from "recharts";
import { getGlobeCrises, askQuestion, queryGenie, type GlobeCountry } from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
    "Very High": "#DC2626",
    "High": "#EA580C",
    "Medium": "#CA8A04",
    "Low": "#16A34A",
    "Very Low": "#15803D",
};

const CHART_COLORS = [
    "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#059669",
    "#0891B2", "#DC2626", "#65A30D"
];

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

interface MetricCardProps {
    label: string;
    value: string | number;
    sub?: string;
}

function MetricCard({ label, value, sub }: MetricCardProps) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    );
}

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
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [queryInput, setQueryInput] = useState("");
    const [queryResult, setQueryResult] = useState<any>(null);
    const [querying, setQuerying] = useState(false);
    const [aiInsight, setAiInsight] = useState<string>("");

    useEffect(() => {
        loadData();
    }, [year]);

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const crisesRes = await getGlobeCrises(year);
            setCountries(crisesRes.countries);
            loadAIInsight();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function loadAIInsight() {
        try {
            const response = await askQuestion(
                "What are the 3 most critical patterns or trends in the humanitarian crisis data?"
            );
            setAiInsight(response.answer);
        } catch (err) {
            console.log("AI insights not available:", err);
            setAiInsight("AI insights are currently unavailable. The dashboard displays real-time data from Databricks SQL warehouse.");
        }
    }

    async function handleQuery() {
        if (!queryInput.trim()) return;
        setQuerying(true);
        setQueryResult(null);
        try {
            const result = await queryGenie(queryInput);
            setQueryResult(result);
        } catch (err: any) {
            setQueryResult({ error: err.message });
        } finally {
            setQuerying(false);
        }
    }

    const metrics = useMemo(() => {
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
        const severeCrises = allCrises.filter(
            (c) => c.severity_class === "Very High" || c.severity_class === "High"
        ).length;
        return {
            totalCountries: countries.length,
            totalPeopleInNeed,
            avgCoverage,
            totalFundingGap,
            severeCrises,
            totalCrises: allCrises.length,
        };
    }, [countries]);

    const pieData = useMemo(() => {
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
        return Object.entries(severityCounts).map(([name, value]) => ({
            name, value,
        }));
    }, [countries]);

    const countryGaps = useMemo(() => {
        return countries.map((c) => ({
            name: c.country_name,
            gap: c.crises.reduce((sum, cr) => sum + (cr.funding_gap_usd ?? 0), 0),
        }))
            .filter((c) => c.gap > 0)
            .sort((a, b) => b.gap - a.gap)
            .slice(0, 10);
    }, [countries]);

    const scatterData = useMemo(() => {
        return countries.flatMap((c) =>
            c.crises.map((crisis) => ({
                x: crisis.acaps_severity ?? 0,
                y: crisis.funding_gap_usd ?? 0,
                name: c.country_name,
                severity: crisis.severity_class,
            }))
        );
    }, [countries]);

    const topSevere = useMemo(() => {
        return [...countries]
            .sort((a, b) => {
                const maxA = Math.max(...a.crises.map(c => c.acaps_severity ?? 0));
                const maxB = Math.max(...b.crises.map(c => c.acaps_severity ?? 0));
                return maxB - maxA;
            })
            .slice(0, 10);
    }, [countries]);

    const comparisonData = useMemo(() => {
        if (selectedCountries.length < 2) return null;
        const selected = countries.filter(c =>
            selectedCountries.includes(c.iso3)
        );
        if (selected.length < 2) return null;
        return selected;
    }, [countries, selectedCountries]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] ${className}`}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Loading dashboard data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center min-h-[600px] ${className}`}>
                <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center max-w-md">
                    <p className="text-sm text-red-600 mb-2">Failed to load data</p>
                    <p className="text-xs text-gray-500">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-6 ${className}`}>
            {/* AI Insights */}
            {aiInsight && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-gray-600 mb-2">AI-Generated Insights</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{aiInsight}</p>
                </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard
                    label="Countries in Crisis"
                    value={metrics.totalCountries}
                    sub={`${year} active crises`}
                />
                <MetricCard
                    label="People in Need"
                    value={formatCompact(metrics.totalPeopleInNeed)}
                />
                <MetricCard
                    label="Avg Funding Coverage"
                    value={`${metrics.avgCoverage.toFixed(1)}%`}
                />
                <MetricCard
                    label="Total Funding Gap"
                    value={`$${formatCompact(metrics.totalFundingGap)}`}
                />
                <MetricCard
                    label="Severe Crises"
                    value={metrics.severeCrises}
                    sub="High/Very High severity"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Severity Distribution */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Severity Distribution</h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    dataKey="value"
                                    label={({ name, value, percent }: { name?: string; value?: number; percent?: number }) =>
                                        `${name}: ${value} (${(percent! * 100).toFixed(0)}%)`
                                    }
                                    labelLine={{ stroke: "#E5E7EB", strokeWidth: 1 }}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell
                                            key={entry.name}
                                            fill={SEVERITY_COLORS[entry.name] ?? CHART_COLORS[index % CHART_COLORS.length]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#FFFFFF",
                                        borderColor: "#E5E7EB",
                                        borderRadius: "8px",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                    }}
                                    itemStyle={{ color: "#111827" }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top 10 Underfunded */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Top 10 Underfunded Countries</h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={countryGaps}
                                layout="vertical"
                                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                                <XAxis
                                    type="number"
                                    tick={{ fill: "#6B7280", fontSize: 11 }}
                                    tickFormatter={formatCompact}
                                />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    tick={{ fill: "#374151", fontSize: 11 }}
                                    width={100}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#FFFFFF",
                                        borderColor: "#E5E7EB",
                                        borderRadius: "8px",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                    }}
                                    itemStyle={{ color: "#111827" }}
                                    formatter={(v: number | undefined) => `$${formatCompact(v ?? 0)}`}
                                />
                                <Bar dataKey="gap" fill="#DC2626" radius={[0, 4, 4, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Severity vs Funding Gap */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Severity vs Funding Gap</h3>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                                <XAxis
                                    dataKey="x"
                                    name="Severity"
                                    label={{ value: 'Severity', position: 'insideBottom', offset: -5, fill: '#6B7280' }}
                                    tick={{ fill: "#6B7280", fontSize: 11 }}
                                    domain={[0, 5]}
                                />
                                <YAxis
                                    dataKey="y"
                                    name="Funding Gap"
                                    label={{ value: 'Funding Gap ($)', angle: -90, position: 'insideLeft', fill: '#6B7280' }}
                                    tick={{ fill: "#6B7280", fontSize: 11 }}
                                    tickFormatter={formatCompact}
                                />
                                <Tooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    contentStyle={{
                                        backgroundColor: "#FFFFFF",
                                        borderColor: "#E5E7EB",
                                        borderRadius: "8px",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                    }}
                                    itemStyle={{ color: "#111827" }}
                                    formatter={(value: any, name: any) => [
                                        name === 'y' ? `$${formatCompact(value ?? 0)}` : value,
                                        name === 'x' ? 'Severity' : 'Funding Gap'
                                    ]}
                                />
                                <Scatter data={scatterData} fill="#7C3AED" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Most Critical Countries */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Most Critical Countries</h3>
                    <div className="space-y-2">
                        {topSevere.slice(0, 5).map((country, idx) => {
                            const maxSeverity = Math.max(...country.crises.map(c => c.acaps_severity ?? 0));
                            const crisis = country.crises.find(c => c.acaps_severity === maxSeverity);
                            const severityColor = (crisis?.severity_class && SEVERITY_COLORS[crisis.severity_class]) === "#DC2626" 
                                ? "bg-red-100 text-red-700"
                                : (crisis?.severity_class && SEVERITY_COLORS[crisis.severity_class]) === "#EA580C"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-yellow-100 text-yellow-700";
                            return (
                                <div
                                    key={country.iso3}
                                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold ${severityColor}`}>
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{country.country_name}</p>
                                            <p className="text-xs text-gray-500">{crisis?.crisis_name}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900">{maxSeverity.toFixed(1)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Natural Language Query */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Natural Language Query</h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={queryInput}
                        onChange={(e) => setQueryInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                        placeholder="e.g., 'Show me countries with funding gap over 1 billion'"
                        className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                        onClick={handleQuery}
                        disabled={querying || !queryInput.trim()}
                        className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        {querying ? "Querying..." : "Query"}
                    </button>
                </div>

                {queryResult && (
                    <div className="mt-6 bg-gray-50 rounded-lg p-5">
                        {queryResult.error ? (
                            <p className="text-sm text-red-600">{queryResult.error}</p>
                        ) : (
                            <div>
                                {queryResult.sql && (
                                    <div className="mb-4 p-3 bg-white rounded-md border border-gray-200">
                                        <p className="text-xs text-gray-500 mb-1">Generated SQL:</p>
                                        <code className="text-sm text-gray-700">{queryResult.sql}</code>
                                    </div>
                                )}
                                {queryResult.rows && queryResult.rows.length > 0 && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    {queryResult.columns.map((col: any) => (
                                                        <th key={col.name} className="text-left py-2 px-3 text-gray-600 font-medium">
                                                            {col.name}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {queryResult.rows.slice(0, 10).map((row: any[], idx: number) => (
                                                    <tr key={idx} className="border-b border-gray-100">
                                                        {row.map((cell, cellIdx) => (
                                                            <td key={cellIdx} className="py-2 px-3 text-gray-700">
                                                                {cell ?? "--"}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {queryResult.description && (
                                    <p className="mt-4 text-sm text-gray-500 italic">{queryResult.description}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Country Comparison */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Country Comparison</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                    {countries.slice(0, 10).map((country) => (
                        <button
                            key={country.iso3}
                            onClick={() => {
                                setSelectedCountries(prev =>
                                    prev.includes(country.iso3)
                                        ? prev.filter(c => c !== country.iso3)
                                        : prev.length < 2 ? [...prev, country.iso3] : prev
                                );
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                selectedCountries.includes(country.iso3)
                                    ? "bg-gray-900 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                            {country.country_name}
                        </button>
                    ))}
                </div>

                {comparisonData && comparisonData.length === 2 && (
                    <div className="grid grid-cols-2 gap-6">
                        {comparisonData.map((country) => {
                            const crisis = country.crises[0];
                            return (
                                <div key={country.iso3} className="bg-gray-50 rounded-lg p-5">
                                    <h4 className="text-base font-semibold text-gray-900 mb-4">{country.country_name}</h4>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500">Severity</span>
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                                crisis?.severity_class === "Very High" ? "bg-red-100 text-red-700" :
                                                crisis?.severity_class === "High" ? "bg-orange-100 text-orange-700" :
                                                "bg-yellow-100 text-yellow-700"
                                            }`}>
                                                {crisis?.severity_class || "N/A"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500">People in Need</span>
                                            <span className="text-sm font-medium text-gray-900">{formatCompact(crisis?.people_in_need ?? 0)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500">Funding Gap</span>
                                            <span className="text-sm font-medium text-gray-900">${formatCompact(crisis?.funding_gap_usd ?? 0)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500">Coverage</span>
                                            <span className="text-sm font-medium text-gray-900">{crisis?.funding_coverage_pct?.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
