import React from 'react';
import { Transaction } from '@/types/finance';

interface TransactionRowProps {
    transaction: Transaction;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({ transaction }) => {
    const isDebit = transaction.type === 'debit';

    return (
        <div className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] gap-4 px-6 py-4 border-b border-[var(--finance-border)] hover:bg-white/[0.02] transition-colors items-center">
            <div className="text-[var(--finance-text-muted)] font-mono text-xs">
                {transaction.date}
            </div>
            <div className="text-sm font-medium">
                {transaction.merchant}
            </div>
            <div className="text-xs text-[var(--finance-text-muted)]">
                {transaction.category}
            </div>
            <div className={`text-right text-sm font-mono ${isDebit ? 'text-[var(--finance-accent-down)]' : 'text-[var(--finance-accent-up)]'
                }`}>
                {isDebit ? '-' : '+'}{new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                }).format(transaction.amount)}
            </div>
            <div className="flex justify-end">
                <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${transaction.status === 'completed'
                        ? 'border-[var(--finance-border)] text-[var(--finance-text-muted)]'
                        : 'border-[var(--finance-accent-down)]/30 text-[var(--finance-accent-down)]'
                    }`}>
                    {transaction.status}
                </span>
            </div>
        </div>
    );
};
