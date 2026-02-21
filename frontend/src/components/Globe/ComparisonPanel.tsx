"use client";

import { useGlobeContext } from "@/context/GlobeContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { X } from "lucide-react";

export function ComparisonPanel() {
    const { comparisonData, setComparisonData } = useGlobeContext();

    if (!comparisonData) return null;

    // Transform data for the radar chart
    const radarData = [
        { name: 'Mismatch Score', source: comparisonData.sourceStats.mismatch, target: comparisonData.targetStats.mismatch, fullMark: 100 },
        { name: 'People (M)', source: comparisonData.sourceStats.peopleInNeed, target: comparisonData.targetStats.peopleInNeed, fullMark: 100 },
        { name: 'Funding Gap', source: comparisonData.sourceStats.gap, target: comparisonData.targetStats.gap, fullMark: 100 },
        { name: 'Risk Level', source: comparisonData.sourceStats.risk, target: comparisonData.targetStats.risk, fullMark: 100 },
        { name: 'Severity', source: comparisonData.sourceStats.severity, target: comparisonData.targetStats.severity, fullMark: 100 },
    ];

    const barData = [
        { name: comparisonData.sourceIso, Metric: comparisonData.sourceStats.mismatch, fill: '#00FF88' },
        { name: comparisonData.targetIso, Metric: comparisonData.targetStats.mismatch, fill: '#00DDFF' },
    ];

    return (
        <div className="fixed right-0 top-0 h-full w-[450px] bg-black/80 backdrop-blur-xl border-l border-white/10 z-50 transform transition-transform duration-500 ease-in-out shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/10">
                <div className="flex flex-col">
                    <span className="text-sm tracking-widest text-[#00FF88] uppercase font-semibold">Live Comparison</span>
                    <h2 className="text-2xl font-bold text-white mt-1">
                        {comparisonData.sourceIso} <span className="text-white/40 font-light px-2">vs</span> {comparisonData.targetIso}
                    </h2>
                </div>
                <button
                    onClick={() => setComparisonData(null)}
                    className="p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                    <X className="text-white w-6 h-6" />
                </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">

                {/* Radar Chart Section */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 shadow-lg">
                    <h3 className="text-sm uppercase tracking-wider text-white/60 mb-4 font-semibold">Crisis Attributes Overview</h3>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                <PolarAngleAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name={comparisonData.sourceIso} dataKey="source" stroke="#00FF88" fill="#00FF88" fillOpacity={0.3} />
                                <Radar name={comparisonData.targetIso} dataKey="target" stroke="#00DDFF" fill="#00DDFF" fillOpacity={0.3} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Bar Chart Section */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 shadow-lg">
                    <h3 className="text-sm uppercase tracking-wider text-white/60 mb-4 font-semibold">Primary Mismatch Metric</h3>
                    <div className="h-[200px] w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <XAxis type="number" domain={[0, 100]} stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.5)' }} />
                                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.2)" tick={{ fill: '#fff', fontWeight: 600 }} width={50} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                />
                                <Bar dataKey="Metric" radius={[0, 4, 4, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Summary Text Box */}
                <div className="bg-gradient-to-br from-[#00FF88]/10 to-[#00DDFF]/10 rounded-2xl p-5 border border-white/10">
                    <h3 className="text-sm uppercase tracking-wider text-white mb-2 font-semibold flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#00FF88] animate-pulse" />
                        AI Analysis
                    </h3>
                    <p className="text-sm text-white/70 leading-relaxed">
                        The current visualization highlights a massive disparity in crisis responses.
                        <strong className="text-white"> {comparisonData.sourceIso}</strong> has a significantly higher severity and mismatch score, indicating aid is critically failing to reach those most impacted compared to <strong className="text-white">{comparisonData.targetIso}</strong>.
                    </p>
                </div>

            </div>
        </div>
    );
}
