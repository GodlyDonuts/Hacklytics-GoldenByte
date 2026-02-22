"use client";

import DatabricksDashboard from "@/components/DatabricksDashboard";
import ThemeProvider from "@/components/landing/ThemeProvider";

export default function DashboardPage() {
    return (
        <ThemeProvider>
            <div className="min-h-screen transition-colors duration-[600ms]" style={{ backgroundColor: 'var(--phase-bg)', color: 'var(--phase-text)' }}>
                {/* Header */}
                <header className="border-b transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)', backgroundColor: 'var(--phase-bg-surface)' }}>
                    <div className="max-w-[1600px] mx-auto px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-bold tracking-widest text-gray-200 font-mono uppercase">
                                    CT<span className="text-blue-500">_</span>Command<span className="text-blue-500">_</span>Center
                                </h1>
                                <p className="text-xs text-gray-500 mt-1 font-mono">
                                    QUANTITATIVE CAPITAL ALLOCATION | {new Date().getFullYear()}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md font-mono transition-colors duration-[600ms]" style={{ backgroundColor: 'rgba(45, 212, 168, 0.1)', borderColor: 'var(--phase-border)', borderWidth: '1px' }}>
                                    <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: 'var(--phase-accent)' }} />
                                    <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--phase-accent)' }}>
                                        SYS.ONLINE
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="w-full">
                    <DatabricksDashboard className="pt-8" />
                </main>

                {/* Footer */}
                <footer className="border-t mt-auto transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)', backgroundColor: 'var(--phase-bg)' }}>
                    <div className="max-w-[1600px] mx-auto px-6 py-6">
                        <div className="flex items-center justify-between font-mono">
                            <p className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--phase-text-muted)' }}>
                                Crisis Topography Analytics // Actian Vector Core
                            </p>
                            <p className="text-[10px] tracking-widest flex items-center gap-2 transition-colors duration-[600ms]" style={{ color: 'var(--phase-accent)' }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--phase-accent)' }} />
                                LIVE DATA STREAM
                            </p>
                        </div>
                    </div>
                </footer>
            </div>
        </ThemeProvider>
    );
}
