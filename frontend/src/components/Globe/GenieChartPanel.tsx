"use client";

import { useGlobeContext } from "@/context/GlobeContext";
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid,
} from "recharts";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const COLORS = ["#00FF88", "#00DDFF", "#FF6B6B", "#FFD93D"];

type ChartType = "bar" | "line" | "table";

function detectChartType(
    columns: { name: string; type: string }[]
): { type: ChartType; labelCol: number; valueCols: number[] } {
    if (columns.length < 2) {
        return { type: "table", labelCol: 0, valueCols: [] };
    }

    const numericTypes = new Set([
        "INT", "BIGINT", "FLOAT", "DOUBLE", "DECIMAL", "LONG", "SHORT",
        "int", "bigint", "float", "double", "decimal", "long", "short",
    ]);
    const dateTypes = new Set([
        "DATE", "TIMESTAMP", "TIMESTAMP_NTZ",
        "date", "timestamp", "timestamp_ntz",
    ]);

    const valueCols = columns
        .map((c, i) => (numericTypes.has(c.type) ? i : -1))
        .filter((i) => i > 0);

    if (valueCols.length === 0) {
        return { type: "table", labelCol: 0, valueCols: [] };
    }

    const firstColType = columns[0].type;
    if (dateTypes.has(firstColType)) {
        return { type: "line", labelCol: 0, valueCols };
    }

    return { type: "bar", labelCol: 0, valueCols };
}

function formatValue(v: string | number | null): string {
    if (v === null || v === undefined) return "--";
    if (typeof v === "number") {
        if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
        if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v);
}

export function GenieChartPanel() {
    const { genieChartData, setGenieChartData } = useGlobeContext();
    const [sqlExpanded, setSqlExpanded] = useState(false);

    if (!genieChartData) return null;

    const { columns, rows, question, description } = genieChartData;
    const { type: chartType, labelCol, valueCols } = detectChartType(columns);

    // Transform rows into recharts-compatible objects
    const chartData = rows.map((row) => {
        const entry: Record<string, string | number | null> = {};
        columns.forEach((col, i) => {
            const val = row[i];
            entry[col.name] = typeof val === "string" && !isNaN(Number(val))
                ? Number(val) : val;
        });
        return entry;
    });

    const labelKey = columns[labelCol]?.name ?? "label";
    const valueKeys = valueCols.map((i) => columns[i].name);

    return (
        <div className="fixed left-0 top-0 h-full w-[500px] bg-black/80 backdrop-blur-xl border-r border-white/10 z-50 shadow-2xl flex flex-col animate-in slide-in-from-left duration-500">
            {/* Header */}
            <div className="flex justify-between items-start p-6 border-b border-white/10">
                <div className="flex-1 min-w-0 pr-4">
                    <span className="text-xs tracking-widest text-[#00FF88] uppercase font-semibold">
                        Genie Query
                    </span>
                    <p className="text-sm text-white/80 mt-1 line-clamp-2">
                        {question}
                    </p>
                </div>
                <button
                    onClick={() => setGenieChartData(null)}
                    className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
                >
                    <X className="text-white w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                {/* Description */}
                {description && (
                    <p className="text-sm text-white/60 leading-relaxed">
                        {description}
                    </p>
                )}

                {/* Chart */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    {chartType === "bar" && (
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey={labelKey}
                                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
                                        angle={-35}
                                        textAnchor="end"
                                        interval={0}
                                    />
                                    <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickFormatter={formatValue} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                        itemStyle={{ color: "#fff" }}
                                        formatter={(v: number | undefined) => formatValue(v ?? 0)}
                                    />
                                    {valueKeys.map((key, i) => (
                                        <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {chartType === "line" && (
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey={labelKey}
                                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
                                        angle={-35}
                                        textAnchor="end"
                                    />
                                    <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickFormatter={formatValue} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }}
                                        itemStyle={{ color: "#fff" }}
                                        formatter={(v: number | undefined) => formatValue(v ?? 0)}
                                    />
                                    {valueKeys.map((key, i) => (
                                        <Line
                                            key={key}
                                            type="monotone"
                                            dataKey={key}
                                            stroke={COLORS[i % COLORS.length]}
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {chartType === "table" && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-white/80">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        {columns.map((c) => (
                                            <th key={c.name} className="text-left p-2 text-white/50 uppercase tracking-wider font-medium">
                                                {c.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 50).map((row, ri) => (
                                        <tr key={ri} className="border-b border-white/5 hover:bg-white/5">
                                            {row.map((cell, ci) => (
                                                <td key={ci} className="p-2">
                                                    {formatValue(cell)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {rows.length > 50 && (
                                <p className="text-xs text-white/40 mt-2 text-center">
                                    Showing 50 of {rows.length} rows
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* SQL (collapsible) */}
                {genieChartData && (
                    <button
                        onClick={() => setSqlExpanded(!sqlExpanded)}
                        className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors w-full"
                    >
                        {sqlExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Generated SQL
                    </button>
                )}
                {sqlExpanded && (
                    <pre className="bg-white/5 rounded-lg p-3 text-xs text-[#00DDFF]/80 overflow-x-auto font-mono border border-white/5">
                        {genieChartData.sql ?? "No SQL generated"}
                    </pre>
                )}

                {/* Row count */}
                <p className="text-xs text-white/30 text-center">
                    {rows.length} row{rows.length !== 1 ? "s" : ""} returned
                </p>
            </div>
        </div>
    );
}
