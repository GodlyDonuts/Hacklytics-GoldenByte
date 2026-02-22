import React from 'react';

interface FinanceLayoutProps {
    children: React.ReactNode;
    currentPage: string;
}

export const FinanceLayout: React.FC<FinanceLayoutProps> = ({ children, currentPage }) => {
    return (
        <div className="flex min-h-screen bg-[var(--finance-bg)] text-[var(--finance-text)] font-sans antialiased">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[var(--finance-border)] flex flex-col pt-12">
                <div className="px-8 mb-12">
                    <div className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--finance-text-muted)]">
                        AESTHETIC_FINANCE
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    {['Overview', 'Accounts', 'Transactions', 'Cards', 'Settings'].map((item) => (
                        <button
                            key={item}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${currentPage === item
                                    ? 'text-[var(--finance-text)]'
                                    : 'text-[var(--finance-text-muted)] hover:text-[var(--finance-text)]'
                                }`}
                        >
                            {item}
                        </button>
                    ))}
                </nav>

                <div className="p-8 border-t border-[var(--finance-border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-sm" />
                        <div className="text-xs">
                            <div className="font-medium">User Account</div>
                            <div className="text-[var(--finance-text-muted)]">Premium Tier</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <header className="h-20 border-b border-[var(--finance-border)] flex items-center justify-between px-12">
                    <h1 className="text-lg font-medium tracking-tight">
                        {currentPage}
                    </h1>
                    <div className="flex items-center gap-6">
                        <div className="text-xs text-[var(--finance-text-muted)] font-mono">
                            FEB 22, 2026 / 08:00 AM
                        </div>
                        <button className="text-sm px-4 py-1.5 border border-[var(--finance-border)] hover:bg-white hover:text-black transition-all">
                            Add Transaction
                        </button>
                    </div>
                </header>
                <div className="p-12">
                    {children}
                </div>
            </main>
        </div>
    );
};
