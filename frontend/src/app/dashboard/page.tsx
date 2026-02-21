"use client";

import DatabricksDashboard from "@/components/DatabricksDashboard";

export default function DashboardPage() {
    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white">
                        Crisis Topography Dashboard
                    </h1>
                    <p className="text-sm text-white/40 mt-1">
                        Humanitarian crisis overview powered by Databricks
                    </p>
                </div>
                <DatabricksDashboard />
            </div>
        </div>
    );
}
