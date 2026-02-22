"use client";

import DatabricksDashboard from "@/components/DatabricksDashboard";
import { VoiceAgent } from "@/components/VoiceAgent";
import { GlobeProvider } from "@/context/GlobeContext";
import { VoiceAgentProvider } from "@/context/VoiceChatContext";

export default function DashboardPage() {
    return (
        <GlobeProvider>
            <VoiceAgentProvider>
                <div
                    className="min-h-screen flex flex-col"
                    style={{ backgroundColor: "#0a0e14", color: "rgba(255,255,255,0.9)" }}
                >
                    <header
                        className="border-b sticky top-0 z-30 backdrop-blur-xl border-[var(--dash-border)] bg-black/80"
                    >
                        <div className="max-w-[1600px] mx-auto px-12 h-16 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <h1
                                    className="text-xs font-bold tracking-[0.4em] uppercase text-white"
                                >
                                    Analytical Engine
                                </h1>
                                <div className="h-4 w-px bg-[var(--dash-border)]" />
                                <span
                                    className="text-[10px] font-medium tracking-widest text-[var(--dash-text-muted)] uppercase"
                                >
                                    Global Monitor
                                </span>
                            </div>
                            <div className="flex items-center gap-8">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-1 h-1 rounded-full bg-white animate-pulse"
                                    />
                                    <span
                                        className="text-[10px] font-mono text-white tracking-tighter"
                                    >
                                        S_LINK_ACTIVE
                                    </span>
                                </div>
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 w-full bg-black">
                        <DatabricksDashboard />
                    </main>
                    <VoiceAgent />
                </div>
            </VoiceAgentProvider>
        </GlobeProvider>
    );
}
