import React from 'react';
import { Account } from '@/types/finance';

interface AccountCardProps {
    account: Account;
}

export const AccountCard: React.FC<AccountCardProps> = ({ account }) => {
    const isPositive = account.trend > 0;

    return (
        <div className="bg-[var(--finance-surface)] border border-[var(--finance-border)] p-6 flex flex-col justify-between h-40">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <div className="text-[var(--finance-text-muted)] text-xs font-medium uppercase tracking-wider">
                        {account.type}
                    </div>
                    <div className="text-lg font-medium tracking-tight">
                        {account.name}
                    </div>
                </div>
                <div className="w-8 h-8 rounded-full border border-[var(--finance-border)] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>
            </div>

            <div className="flex items-baseline justify-between">
                <div className="text-2xl font-semibold tracking-tighter">
                    {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: account.currency,
                    }).format(account.balance)}
                </div>
                <div className={`text-[10px] font-mono ${isPositive ? 'text-[var(--finance-accent-up)]' : 'text-[var(--finance-accent-down)]'
                    }`}>
                    {isPositive ? '+' : ''}{account.trend}%
                </div>
            </div>
        </div>
    );
};
