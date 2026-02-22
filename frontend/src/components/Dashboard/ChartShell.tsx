import React from 'react';

interface ChartShellProps {
    label: string;
    children: React.ReactNode;
    span?: 'full' | 'half';
}

export const ChartShell: React.FC<ChartShellProps> = ({ label, children, span = 'full' }) => {
    return (
        <div className={`border border-[var(--dash-border)] bg-[var(--dash-surface)] p-8 ${span === 'full' ? 'col-span-12' : 'col-span-12 lg:col-span-6'}`}>
            <div className="flex justify-between items-end mb-8 border-b border-[var(--dash-border)] pb-4">
                <div className="text-[9px] font-bold tracking-[0.3em] text-[var(--dash-text-muted)] uppercase">
                    {label}
                </div>
                <div className="flex gap-4">
                    <div className="w-2 h-2 bg-white" />
                    <div className="w-2 h-2 bg-[var(--dash-text-muted)]" />
                </div>
            </div>
            <div className="h-[300px] w-full">
                {children}
            </div>
        </div>
    );
};
