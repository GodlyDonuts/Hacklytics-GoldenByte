"use client";

/**
 * GenieChartPanel
 *
 * Slide-in overlay that renders when genie query data is present in GlobeContext.
 * Auto-detects whether the result is chartable (string label column + numeric
 * value columns) and renders a horizontal bar chart via recharts. Always shows
 * a data table beneath the chart.
 */

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useGlobeContext, type GenieChartData } from "@/context/GlobeContext";

/** Gradient palette -- each entry is [barColor, glowColor] */
const BAR_GRADIENTS = [
  ["#00d4ff", "rgba(0,212,255,0.3)"],
  ["#00e5a0", "rgba(0,229,160,0.3)"],
  ["#f59e0b", "rgba(245,158,11,0.3)"],
  ["#ef4444", "rgba(239,68,68,0.3)"],
  ["#a855f7", "rgba(168,85,247,0.3)"],
  ["#ec4899", "rgba(236,72,153,0.3)"],
  ["#06b6d4", "rgba(6,182,212,0.3)"],
  ["#84cc16", "rgba(132,204,22,0.3)"],
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

/** Custom tooltip matching the panel aesthetic */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d1117]/95 backdrop-blur-md px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-white/90 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-white/50">{humanizeColumnName(entry.name)}:</span>
          <span className="text-white font-mono font-medium">
            {formatValue(entry.value, "INT")}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GenieChartPanel() {
  const { genieChartData, setGenieChartData } = useGlobeContext();
  const [showSql, setShowSql] = useState(false);

  const chartSpec = useMemo(() => {
    if (!genieChartData) return null;
    return detectChart(genieChartData);
  }, [genieChartData]);

  if (!genieChartData) return null;

  const { columns, rows, question, description, sql } = genieChartData;
  const hasData = rows.length > 0;

  // For the primary value column, find the max to compute bar widths for visual ranking
  const primaryValueCol = chartSpec
    ? columns[chartSpec.valueIndices[0]]?.name
    : null;

  return (
    <div className="absolute top-4 left-4 z-30 w-[460px] max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0e14]/90 backdrop-blur-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
              <p className="text-xs text-[#00d4ff]/80 font-semibold tracking-[0.15em] uppercase">
                Query Result
              </p>
            </div>
            <p className="text-sm text-white/90 leading-snug font-medium" title={question}>
              {question}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGenieChartData(null)}
            className="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-md text-white/30 hover:text-white/80 hover:bg-white/10 transition-all"
            aria-label="Close panel"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {description && (
          <p className="text-sm text-white/40 leading-relaxed mt-2">{description}</p>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
        {/* Horizontal bar chart */}
        {chartSpec && chartSpec.data.length <= 20 && (
          <div style={{ height: Math.max(180, chartSpec.data.length * 36 + 24) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartSpec.data}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                barCategoryGap="20%"
              >
                <XAxis
                  type="number"
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatValue(v, "INT")}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                {chartSpec.valueIndices.map((vi, idx) => (
                  <Bar
                    key={columns[vi].name}
                    dataKey={columns[vi].name}
                    radius={[0, 4, 4, 0]}
                    barSize={chartSpec.data.length > 10 ? 14 : 20}
                  >
                    {chartSpec.data.map((_, entryIdx) => (
                      <Cell
                        key={entryIdx}
                        fill={BAR_GRADIENTS[(idx + entryIdx) % BAR_GRADIENTS.length][0]}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Inline ranked list for small result sets */}
        {chartSpec && primaryValueCol && chartSpec.data.length <= 20 && (
          <div className="space-y-1.5">
            {chartSpec.data.map((row, i) => {
              const val = row[primaryValueCol] as number;
              const max = Math.max(
                ...chartSpec.data.map((r) => (r[primaryValueCol] as number) || 0),
                1
              );
              const pct = (val / max) * 100;
              const color = BAR_GRADIENTS[i % BAR_GRADIENTS.length];
              return (
                <div key={i} className="group relative">
                  {/* Background bar */}
                  <div
                    className="absolute inset-0 rounded-lg opacity-[0.07] transition-opacity group-hover:opacity-[0.12]"
                    style={{
                      background: `linear-gradient(90deg, ${color[0]} ${pct}%, transparent ${pct}%)`,
                    }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="text-xs font-mono font-bold w-5 text-center"
                        style={{ color: color[0] }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm text-white/80 truncate">
                        {row.label}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-semibold text-white/90 tabular-nums">
                      {formatValue(val, "INT")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Data table for larger or multi-column results */}
        {hasData && chartSpec && chartSpec.valueIndices.length > 1 && (
          <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  {columns.map((col) => (
                    <th
                      key={col.name}
                      className={`py-2.5 px-3 font-medium whitespace-nowrap ${
                        isNumericType(col.type)
                          ? "text-right text-white/40"
                          : "text-left text-white/40"
                      }`}
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
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`py-2 px-3 whitespace-nowrap ${
                          isNumericType(columns[ci]?.type ?? "STRING")
                            ? "text-right text-white/70 font-mono tabular-nums"
                            : "text-white/60"
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
              <p className="text-xs text-white/30 py-2 text-center">
                Showing 25 of {rows.length} rows
              </p>
            )}
          </div>
        )}

        {/* Table-only fallback when not chartable */}
        {hasData && !chartSpec && (
          <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  {columns.map((col) => (
                    <th
                      key={col.name}
                      className={`py-2.5 px-3 font-medium whitespace-nowrap ${
                        isNumericType(col.type)
                          ? "text-right text-white/40"
                          : "text-left text-white/40"
                      }`}
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
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`py-2 px-3 whitespace-nowrap ${
                          isNumericType(columns[ci]?.type ?? "STRING")
                            ? "text-right text-white/70 font-mono tabular-nums"
                            : "text-white/60"
                        }`}
                      >
                        {formatValue(cell, columns[ci]?.type ?? "STRING")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!hasData && !description && (
          <p className="text-sm text-white/30 text-center py-6">
            No data returned for this query.
          </p>
        )}

        {/* SQL toggle */}
        {sql && (
          <div>
            <button
              type="button"
              onClick={() => setShowSql(!showSql)}
              className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors tracking-wide uppercase"
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="currentColor"
                className={`transition-transform ${showSql ? "rotate-90" : ""}`}
              >
                <path d="M2 1l4 3-4 3z" />
              </svg>
              Generated SQL
            </button>
            {showSql && (
              <pre className="mt-2 p-3 rounded-lg bg-black/30 border border-white/[0.04] text-xs text-white/35 overflow-x-auto font-mono leading-relaxed">
                {sql}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
