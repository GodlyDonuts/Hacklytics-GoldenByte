"use client";

import DatabricksDashboard from "@/components/DatabricksDashboard";

export default function DashboardPage() {
    return (
        <div className="min-h-screen bg-[#0d1117]">
            {/* Header */}
            <header className="border-b border-[#30363d] bg-[#161b22]">
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
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 border border-blue-500/30 rounded-md font-mono">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0" />
                                <span className="text-[10px] font-bold text-blue-400 tracking-wider">
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
            <footer className="border-t border-[#30363d] bg-[#0d1117] mt-auto">
                <div className="max-w-[1600px] mx-auto px-6 py-6">
                    <div className="flex items-center justify-between font-mono">
                        <p className="text-[10px] text-gray-600 tracking-widest uppercase">
                            Crisis Topography Analytics // Actian Vector Core
                        </p>
                        <p className="text-[10px] text-green-500/70 tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            LIVE DATA STREAM
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
