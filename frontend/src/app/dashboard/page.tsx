"use client";

import DatabricksDashboard from "@/components/DatabricksDashboard";

export default function DashboardPage() {
    return (
        <div
            className="min-h-screen flex flex-col"
            style={{ backgroundColor: "#0a0e14", color: "rgba(255,255,255,0.9)" }}
        >
            <header
                className="border-b sticky top-0 z-30 backdrop-blur-md"
                style={{
                    borderColor: "rgba(255,255,255,0.08)",
                    backgroundColor: "rgba(13,17,23,0.85)",
                }}
            >
                <div className="max-w-[1600px] mx-auto px-6 lg:px-8 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1
                            className="text-[15px] font-semibold tracking-[-0.01em]"
                            style={{ color: "rgba(255,255,255,0.9)" }}
                        >
                            Crisis Topography
                        </h1>
                        <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                                color: "rgba(255,255,255,0.3)",
                                backgroundColor: "#161b22",
                            }}
                        >
                            Analytics
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span
                            className="text-xs"
                            style={{ color: "rgba(255,255,255,0.3)" }}
                        >
                            {new Date().getFullYear()} Global Overview
                        </span>
                        <div className="flex items-center gap-1.5">
                            <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: "#00d4ff" }}
                            />
                            <span
                                className="text-xs font-medium"
                                style={{ color: "#00d4ff" }}
                            >
                                Live
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 w-full">
                <DatabricksDashboard />
            </main>
        </div>
    );
}
