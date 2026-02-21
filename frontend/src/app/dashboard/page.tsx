"use client";

import DatabricksDashboard from "@/components/DatabricksDashboard";

export default function DashboardPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="border-b border-gray-200 bg-white">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">
                                Crisis Topography Dashboard
                            </h1>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Humanitarian crisis analytics • {new Date().getFullYear()}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
                                <div className="w-2 h-2 bg-green-600 rounded-full" />
                                <span className="text-xs font-medium text-green-700">
                                    Databricks Connected
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                <DatabricksDashboard />
            </main>

            {/* Footer */}
            <footer className="border-t border-gray-200 mt-12 bg-white">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                            Crisis Topography Analytics • Data Source: OCHA / ACAPS
                        </p>
                        <p className="text-xs text-gray-400">
                            Last Updated: Real-time
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
