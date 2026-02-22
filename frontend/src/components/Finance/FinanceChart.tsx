import React from 'react';

interface DataPoint {
    date: string;
    value: number;
}

interface FinanceChartProps {
    data: DataPoint[];
    height?: number;
}

export const FinanceChart: React.FC<FinanceChartProps> = ({ data, height = 200 }) => {
    if (!data || data.length === 0) return null;

    const width = 800;
    const padding = 40;
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue;

    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
        const y = height - ((d.value - minValue) / range) * (height - padding * 2) - padding;
        return { x, y };
    });

    const pathD = `M ${points[0].x} ${points[0].y} ` +
        points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

    return (
        <div className="w-full bg-[var(--finance-surface)] border border-[var(--finance-border)] p-8">
            <div className="flex justify-between items-center mb-8">
                <div className="text-xs font-semibold uppercase tracking-widest text-[var(--finance-text-muted)]">
                    Expenditure Velocity
                </div>
                <div className="flex gap-4 text-[10px] font-mono text-[var(--finance-text-muted)]">
                    <span>MAX: {maxValue}</span>
                    <span>MIN: {minValue}</span>
                </div>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                    <line
                        key={p}
                        x1={padding}
                        y1={padding + p * (height - padding * 2)}
                        x2={width - padding}
                        y2={padding + p * (height - padding * 2)}
                        stroke="var(--finance-border)"
                        strokeWidth="0.5"
                        strokeDasharray="4 4"
                    />
                ))}

                {/* The Line */}
                <path
                    d={pathD}
                    fill="none"
                    stroke="var(--finance-text)"
                    strokeWidth="1.5"
                    className="transition-all duration-700 ease-in-out"
                />

                {/* Data Points */}
                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="2"
                        fill="var(--finance-bg)"
                        stroke="var(--finance-text)"
                        strokeWidth="1"
                        className="hover:r-4 transition-all"
                    />
                ))}
            </svg>
        </div>
    );
};
