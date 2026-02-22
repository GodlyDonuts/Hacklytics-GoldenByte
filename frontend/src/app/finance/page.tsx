"use client";

import React from 'react';
import { FinanceLayout } from '@/components/Finance/FinanceLayout';
import { AccountCard } from '@/components/Finance/AccountCard';
import { TransactionRow } from '@/components/Finance/TransactionRow';
import { FinanceChart } from '@/components/Finance/FinanceChart';
import { Account, Transaction } from '@/types/finance';

const MOCK_ACCOUNTS: Account[] = [
    { id: '1', name: 'Primary Checking', type: 'Checking', balance: 12450.60, currency: 'USD', trend: 2.4 },
    { id: '2', name: 'High Yield Savings', type: 'Savings', balance: 45000.00, currency: 'USD', trend: 0.8 },
    { id: '3', name: 'Equity Portfolio', type: 'Investment', balance: 89200.15, currency: 'USD', trend: -1.2 },
];

const MOCK_TRANSACTIONS: Transaction[] = [
    { id: 't1', date: '2026-02-21', merchant: 'Apple Store', category: 'Technology', amount: 1299.00, type: 'debit', status: 'completed' },
    { id: 't2', date: '2026-02-21', merchant: 'Whole Foods', category: 'Groceries', amount: 84.20, type: 'debit', status: 'completed' },
    { id: 't3', date: '2026-02-20', merchant: 'Salary Deposit', category: 'Income', amount: 4500.00, type: 'credit', status: 'completed' },
    { id: 't4', date: '2026-02-19', merchant: 'Equinox Gym', category: 'Health', amount: 250.00, type: 'debit', status: 'pending' },
    { id: 't5', date: '2026-02-18', merchant: 'Stripe Transfer', category: 'Business', amount: 1200.00, type: 'credit', status: 'completed' },
];

const MOCK_CHART_DATA = [
    { date: 'Feb 15', value: 8200 },
    { date: 'Feb 16', value: 8500 },
    { date: 'Feb 17', value: 7900 },
    { date: 'Feb 18', value: 9100 },
    { date: 'Feb 19', value: 8800 },
    { date: 'Feb 20', value: 9400 },
    { date: 'Feb 21', value: 9200 },
];

export default function FinanceDashboard() {
    return (
        <FinanceLayout currentPage="Overview">
            <div className="space-y-12">
                {/* Account Overview Grid */}
                <section>
                    <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--finance-text-muted)] mb-6">
                        CAPITAL_ALLOCATION
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {MOCK_ACCOUNTS.map(account => (
                            <AccountCard key={account.id} account={account} />
                        ))}
                    </div>
                </section>

                {/* Chart Section */}
                <section>
                    <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--finance-text-muted)] mb-6">
                        PERFORMANCE_METRICS
                    </div>
                    <FinanceChart data={MOCK_CHART_DATA} />
                </section>

                {/* Transactions Table */}
                <section>
                    <div className="flex justify-between items-end mb-6">
                        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--finance-text-muted)]">
                            LEDGER_OPERATIONS
                        </div>
                        <div className="text-xs font-mono text-[var(--finance-text-muted)] hover:text-white cursor-pointer transition-colors">
                            VIEW_ALL_LOGS →
                        </div>
                    </div>
                    <div className="bg-[var(--finance-surface)] border border-[var(--finance-border)] overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[1fr_2fr_1.5fr_1fr_1fr] gap-4 px-6 py-3 bg-white/[0.02] border-b border-[var(--finance-border)] text-[10px] font-bold uppercase tracking-widest text-[var(--finance-text-muted)]">
                            <div>Date</div>
                            <div>Merchant</div>
                            <div>Category</div>
                            <div className="text-right">Amount</div>
                            <div className="text-right">Status</div>
                        </div>
                        {/* Table Rows */}
                        <div className="divide-y divide-[var(--finance-border)]">
                            {MOCK_TRANSACTIONS.map(tx => (
                                <TransactionRow key={tx.id} transaction={tx} />
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </FinanceLayout>
    );
}
