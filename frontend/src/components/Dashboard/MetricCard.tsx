import React from 'react';

interface MetricCardProps {
    label: string;
    value: string | number;
    highlight?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, highlight }) => {
    return (
        <div className="bg-[var(--dash-surface)] border border-[var(--dash-border)] p-6 group hover:border-[var(--dash-text-muted)] transition-colors">
            <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--dash-text-muted)] mb-3 group-hover:text-[var(--dash-text)] transition-colors">
                {label}
            </div>
            <div className={`text-2xl font-semibold tracking-tight tabular-nums ${highlight ? 'text-white' : 'text-[var(--dash-text-muted)]'}`}>
                {value}
            </div>
        </div>
    );
};
