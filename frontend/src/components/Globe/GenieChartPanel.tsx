"use client";

/**
 * GenieChartPanel
 *
 * Slide-in overlay that renders when genie query data is present in GlobeContext.
 * Auto-detects whether the result is chartable (string label column + numeric
 * value columns) and renders a bar chart via recharts. Always shows a data table
 * beneath the chart.
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useGlobeContext, type GenieChartData } from "@/context/GlobeContext";

const CHART_PALETTE = [
  "#00d4ff",
  "#00e5a0",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

function isNumericType(type: string): boolean {
  const t = type.toUpperCase();
  return (
    t.includes("INT") ||
    t.includes("DECIMAL") ||
    t.includes("DOUBLE") ||
    t.includes("FLOAT") ||
    t.includes("LONG") ||
    t.includes("SHORT") ||
    t.includes("BIGINT") ||
    t.includes("NUMBER") ||
    t === "NUMERIC"
  );
}

function formatValue(val: string | number | null, type: string): string {
  if (val === null || val === undefined) return "--";
  if (typeof val === "number" || (typeof val === "string" && isNumericType(type))) {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return String(val);
    if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  }
  return String(val);
}

function humanizeColumnName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ChartSpec {
  labelIndex: number;
  valueIndices: number[];
  data: Record<string, string | number>[];
}

function detectChart(chartData: GenieChartData): ChartSpec | null {
  const { columns, rows } = chartData;
  if (!columns.length || !rows.length || rows.length > 50) return null;

  // Find first string column as labels, all numeric columns as values
  let labelIndex = -1;
  const valueIndices: number[] = [];

  for (let i = 0; i < columns.length; i++) {
    if (isNumericType(columns[i].type)) {
      valueIndices.push(i);
    } else if (labelIndex === -1) {
      labelIndex = i;
    }
  }

  if (valueIndices.length === 0 || labelIndex === -1) return null;

  const data = rows.map((row) => {
    const entry: Record<string, string | number> = {
      label: String(row[labelIndex] ?? ""),
    };
    for (const vi of valueIndices) {
      const raw = row[vi];
      entry[columns[vi].name] =
        typeof raw === "number" ? raw : parseFloat(String(raw ?? "0")) || 0;
    }
    return entry;
  });

  return { labelIndex, valueIndices, data };
}

export default function GenieChartPanel() {
  const { genieChartData, setGenieChartData } = useGlobeContext();

  const chartSpec = useMemo(() => {
    if (!genieChartData) return null;
    return detectChart(genieChartData);
  }, [genieChartData]);

  if (!genieChartData) return null;

  const { columns, rows, question, description, sql } = genieChartData;
  const hasData = rows.length > 0;

  return (
    <div className="absolute top-4 left-4 z-30 w-[480px] max-h-[calc(100vh-2rem)] flex flex-col rounded-xl border border-[#00d4ff]/20 bg-[#0d1117]/95 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#00d4ff] font-medium tracking-wider uppercase mb-1">
            Query Result
          </p>
          <p className="text-sm text-white/90 leading-snug truncate" title={question}>
            {question}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGenieChartData(null)}
          className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close panel"
        >
          x
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
        {/* Description */}
        {description && (
          <p className="text-sm text-white/70 leading-relaxed">{description}</p>
        )}

        {/* Chart */}
        {chartSpec && (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartSpec.data}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => formatValue(v, "INT")}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d21",
                    borderColor: "rgba(0,212,255,0.3)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  labelStyle={{ color: "#00d4ff" }}
                  formatter={(value?: number, name?: string) => [
                    formatValue(value ?? 0, "INT"),
                    humanizeColumnName(name ?? ""),
                  ]}
                />
                {chartSpec.valueIndices.map((vi, idx) => (
                  <Bar
                    key={columns[vi].name}
                    dataKey={columns[vi].name}
                    fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                    radius={[3, 3, 0, 0]}
                    barSize={chartSpec.data.length > 15 ? 12 : 20}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Data table */}
        {hasData && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  {columns.map((col) => (
                    <th
                      key={col.name}
                      className="text-left py-2 px-2 text-[#00d4ff]/80 font-medium whitespace-nowrap"
                    >
                      {humanizeColumnName(col.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`py-1.5 px-2 whitespace-nowrap ${
                          isNumericType(columns[ci]?.type ?? "STRING")
                            ? "text-right text-white/80 font-mono"
                            : "text-white/70"
                        }`}
                      >
                        {formatValue(cell, columns[ci]?.type ?? "STRING")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 25 && (
              <p className="text-xs text-white/40 mt-2 text-center">
                Showing 25 of {rows.length} rows
              </p>
            )}
          </div>
        )}

        {!hasData && !description && (
          <p className="text-sm text-white/40 text-center py-6">
            No data returned for this query.
          </p>
        )}

        {/* SQL (collapsed) */}
        {sql && (
          <details className="group">
            <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60 transition-colors">
              View generated SQL
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-black/40 text-[10px] text-white/50 overflow-x-auto font-mono leading-relaxed">
              {sql}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
