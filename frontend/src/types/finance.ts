export type TransactionStatus = 'completed' | 'pending' | 'flagged';
export type TransactionType = 'credit' | 'debit';

export interface Transaction {
    id: string;
    date: string;
    merchant: string;
    category: string;
    amount: number;
    type: TransactionType;
    status: TransactionStatus;
}

export interface Account {
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
    trend: number; // percentage change
}

export interface FinancialSummary {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
}
