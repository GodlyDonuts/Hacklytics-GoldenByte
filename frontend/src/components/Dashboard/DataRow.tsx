import React from 'react';

interface DataRowProps {
    label: string;
    value: string | number;
    subValue?: string;
    trend?: number;
}

export const DataRow: React.FC<DataRowProps> = ({ label, value, subValue, trend }) => {
    return (
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 py-4 border-b border-[var(--dash-border)] hover:bg-white/[0.02] transition-colors items-center group">
            <div className="px-6">
                <div className="text-sm font-medium text-white group-hover:tracking-wide transition-all duration-300">
                    {label}
                </div>
                {subValue && (
                    <div className="text-[10px] uppercase tracking-widest text-[var(--dash-text-muted)] mt-1">
                        {subValue}
                    </div>
                )}
            </div>
            <div className="text-right tabular-nums text-sm font-light text-[var(--dash-text-muted)] group-hover:text-white transition-colors">
                {value}
            </div>
            <div className="text-right px-6">
                {trend !== undefined && (
                    <span className={`font-mono text-[10px] ${trend > 0 ? 'text-[var(--dash-sage)]' : 'text-[var(--dash-terracotta)]'}`}>
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
        </div>
    );
};
