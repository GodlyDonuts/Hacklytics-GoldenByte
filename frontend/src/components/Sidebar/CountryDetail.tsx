"use client";

import { useEffect, useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { getGlobeCrises, getGlobeB2B, type GlobeCrisis, type B2BProject } from "@/lib/api";

interface CountryDetailProps {
    countryCode: string;
    countryName?: string | null;
    year?: number;
}

function formatCompact(v: number | null): string {
    if (v === null || v === undefined) return "--";
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function CountryDetail({ countryCode, countryName, year = 2024 }: CountryDetailProps) {
    const [crises, setCrises] = useState<GlobeCrisis[]>([]);
    const [projects, setProjects] = useState<B2BProject[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!countryCode) return;
        setLoading(true);

        Promise.all([
            getGlobeCrises(year).then((res) => {
                const country = res.countries.find((c) => c.iso3 === countryCode);
                setCrises(country?.crises ?? []);
            }),
            getGlobeB2B(countryCode, year)
                .then((res) => setProjects(res.projects))
                .catch(() => setProjects([])),
        ]).finally(() => setLoading(false));
    }, [countryCode, year]);

    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
                <div className="h-[200px] bg-white/5 rounded-2xl animate-pulse" />
            </div>
        );
    }

    const severityData = crises
        .filter((c) => c.acaps_severity !== null)
        .map((c) => ({
            name: c.crisis_name?.slice(0, 20) ?? "Unknown",
            severity: c.acaps_severity,
        }));

    const fundingData = crises
        .filter((c) => c.funding_gap_usd !== null || c.funding_coverage_pct !== null)
        .map((c) => {
            const gap = c.funding_gap_usd ?? 0;
            const coverage = c.funding_coverage_pct ?? 0;
            const funded = coverage > 0 && gap > 0 ? (gap * coverage) / (100 - coverage) : 0;
            return {
                name: c.crisis_name?.slice(0, 20) ?? "Unknown",
                funded: funded,
                gap: gap,
            };
        });

    const b2bData = projects
        .filter((p) => p.b2b_ratio !== null)
        .slice(0, 30)
        .map((p) => ({
            name: p.project_name?.slice(0, 15) ?? p.project_code ?? "?",
            b2b: p.b2b_ratio,
            outlier: p.is_outlier,
        }));

    return (
        <div className="space-y-6 p-6">
            <h3 className="text-lg font-bold text-white">
                {countryName ?? countryCode}
            </h3>

            {/* Crisis Severity */}
            {severityData.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 mb-3 font-semibold">
                        Crisis Severity
                    </h4>
                    <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={severityData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 9 }}
                                    angle={-30}
                                    textAnchor="end"
                                    interval={0}
                                />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} domain={[0, 5]} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                    itemStyle={{ color: "#fff" }}
                                />
                                <Bar dataKey="severity" fill="#FF6B6B" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Funding Breakdown */}
            {fundingData.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 mb-3 font-semibold">
                        Funding Breakdown
                    </h4>
                    <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={fundingData} margin={{ top: 5, right: 10, left: 10, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 9 }}
                                    angle={-30}
                                    textAnchor="end"
                                    interval={0}
                                />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} tickFormatter={formatCompact} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(v: number | undefined) => formatCompact(v ?? 0)}
                                />
                                <Bar dataKey="funded" stackId="a" fill="#00FF88" radius={[0, 0, 0, 0]} name="Funded" />
                                <Bar dataKey="gap" stackId="a" fill="#FF6B6B" radius={[4, 4, 0, 0]} name="Gap" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Project B2B Distribution */}
            {b2bData.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <h4 className="text-xs uppercase tracking-wider text-white/50 mb-3 font-semibold">
                        Project B2B Ratios
                    </h4>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={b2bData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 8 }}
                                    angle={-45}
                                    textAnchor="end"
                                    interval={0}
                                />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} tickFormatter={formatCompact} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(v: number | undefined) => formatCompact(v ?? 0)}
                                />
                                <Bar dataKey="b2b" radius={[4, 4, 0, 0]} name="B2B Ratio">
                                    {b2bData.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={entry.outlier ? "#FF6B6B" : "#00DDFF"}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-white/30 mt-2">
                        Red bars indicate statistical outliers
                    </p>
                </div>
            )}

            {crises.length === 0 && projects.length === 0 && (
                <p className="text-sm text-white/50">
                    No crisis or project data available for {countryCode} in {year}.
                </p>
            )}
        </div>
    );
}
