'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';

const useCases = [
    {
        id: 'funding-gap',
        tab: 'FUNDING GAP',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>,
        title: 'Funding Gap Heatmap',
        desc: 'Using all other humanitarian indicators, identify which crises receive disproportionately low funding relative to their severity score.',
        visual: (
            <div className="space-y-4">
                <p className="label-caps mb-4">Per-capita funding by severity tier</p>
                {[
                    { label: 'Sudan', pct: 72, amount: '$33.87', color: '#c0392b' },
                    { label: 'Yemen', pct: 55, amount: '$41.20', color: '#d4783a' },
                    { label: 'Myanmar', pct: 40, amount: '$52.44', color: '#d4783a' },
                    { label: 'Ukraine', pct: 88, amount: '$198.50', color: '#1a8a6e' },
                ].map((bar) => (
                    <div key={bar.label} className="space-y-1.5">
                        <div className="flex justify-between text-[13px]">
                            <span className="phase-text">{bar.label}</span>
                            <span className="phase-text-muted font-mono">{bar.amount}/capita</span>
                        </div>
                        <div
                            className="h-[20px] w-full rounded overflow-hidden transition-colors duration-[600ms]"
                            style={{ background: 'color-mix(in srgb, var(--phase-text) 8%, transparent)' }}
                        >
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${bar.pct}%` }}
                                transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                                className="h-full rounded"
                                style={{ background: bar.color, opacity: 0.75 }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        ),
    },
    {
        id: 'anomaly',
        tab: 'ANOMALY DETECTION',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /></svg>,
        title: 'ML Anomaly Detection',
        desc: 'Automated isolation-forest models flag projects and countries whose funding-to-need ratio deviates significantly from global baselines.',
        visual: (
            <div className="space-y-3">
                <p className="label-caps mb-4">Anomaly scan output</p>
                <div className="font-mono text-[12px] leading-[1.8] bg-[#1a1520] text-[#9e9590] rounded-xl p-5">
                    <p className="text-[#6e6560]"># Isolation Forest — anomaly_scores.py</p>
                    <p><span className="text-[#2dd4a8]">import</span> <span className="text-[#ede8e0]">sklearn.ensemble</span> <span className="text-[#2dd4a8]">as</span> <span className="text-[#ede8e0]">IsolationForest</span></p>
                    <p className="mt-2"><span className="text-[#ede8e0]">model = IsolationForest(contamination=</span><span className="text-[#9b6dff]">0.1</span><span className="text-[#ede8e0]">)</span></p>
                    <p><span className="text-[#ede8e0]">scores = model.fit_predict(funding_matrix)</span></p>
                    <p className="mt-2 text-[#6e6560]"># Results:</p>
                    <p><span className="text-[#ede8e0]">anomalies_detected: </span><span className="text-[#c0392b]">23</span><span className="text-[#ede8e0]"> / 194 countries</span></p>
                    <p><span className="text-[#ede8e0]">mean_mismatch_score: </span><span className="text-[#2dd4a8]">0.73</span></p>
                    <p><span className="text-[#ede8e0]">worst_outlier: Sudan (σ = </span><span className="text-[#9b6dff]">4.2</span><span className="text-[#ede8e0]">)</span></p>
                </div>
            </div>
        ),
    },
    {
        id: 'voice',
        tab: 'VOICE AI',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>,
        title: 'Voice-Navigable Intelligence',
        desc: 'Ask questions about any crisis in natural language. The ElevenLabs-powered voice agent interprets your query, fetches real-time data, and narrates the response.',
        visual: (
            <div className="space-y-4">
                <p className="label-caps mb-4">Conversation</p>
                <div className="space-y-3">
                    <div
                        className="rounded-xl px-4 py-3 transition-all duration-[600ms]"
                        style={{
                            background: 'color-mix(in srgb, var(--phase-accent) 10%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--phase-accent) 20%, transparent)',
                        }}
                    >
                        <p className="text-[13px] phase-accent">&ldquo;Which country has the worst funding mismatch right now?&rdquo;</p>
                    </div>
                    <div
                        className="rounded-xl px-4 py-3 transition-all duration-[600ms]"
                        style={{
                            background: 'var(--phase-bg-surface)',
                            border: '1px solid var(--phase-border)',
                        }}
                    >
                        <p className="text-[13px] leading-relaxed phase-text-secondary">
                            Sudan currently has the highest mismatch score at <span className="font-medium phase-text">0.87</span>. With 24.8 million people affected but only $33.87 per capita in funding, the gap is 5.5× larger than the global median.
                        </p>
                    </div>
                    <div
                        className="rounded-xl px-4 py-3 transition-all duration-[600ms]"
                        style={{
                            background: 'color-mix(in srgb, var(--phase-accent) 10%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--phase-accent) 20%, transparent)',
                        }}
                    >
                        <p className="text-[13px] phase-accent">&ldquo;Compare that to Ukraine&rdquo;</p>
                    </div>
                    <div
                        className="rounded-xl px-4 py-3 transition-all duration-[600ms]"
                        style={{
                            background: 'var(--phase-bg-surface)',
                            border: '1px solid var(--phase-border)',
                        }}
                    >
                        <p className="text-[13px] leading-relaxed phase-text-secondary">
                            Ukraine receives <span className="font-medium phase-text">$198.50</span> per capita — 5.9× more than Sudan, despite a lower severity classification.
                        </p>
                    </div>
                </div>
            </div>
        ),
    },
    {
        id: 'compare',
        tab: 'COMPARISON',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
        title: 'Country Benchmarking',
        desc: 'Side-by-side analysis of crisis indicators, funding levels, and intervention effectiveness across countries and years.',
        visual: (
            <div>
                <p className="label-caps mb-5">Sudan vs Ukraine — 2024</p>
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="border-b transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                            <th className="text-left py-2.5 text-[11px] font-medium tracking-wider uppercase phase-text-muted">Metric</th>
                            <th className="text-right py-2.5 text-[11px] font-medium tracking-wider uppercase phase-text-muted">Sudan</th>
                            <th className="text-right py-2.5 text-[11px] font-medium tracking-wider uppercase phase-text-muted">Ukraine</th>
                        </tr>
                    </thead>
                    <tbody className="font-mono">
                        {[
                            { metric: 'People in Need', sudan: '24.8M', ukraine: '14.6M' },
                            { metric: 'Funding / Capita', sudan: '$33.87', ukraine: '$198.50' },
                            { metric: 'Severity (0-5)', sudan: '4.8', ukraine: '3.2' },
                            { metric: 'Mismatch Score', sudan: '0.87', ukraine: '0.21' },
                            { metric: '$ Required', sudan: '$2.7B', ukraine: '$3.1B' },
                        ].map((row) => (
                            <tr key={row.metric} className="border-b last:border-0 transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                                <td className="py-2.5 font-sans phase-text-secondary">{row.metric}</td>
                                <td className="py-2.5 text-right phase-text">{row.sudan}</td>
                                <td className="py-2.5 text-right phase-text">{row.ukraine}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ),
    },
];

export default function UseCaseGrid() {
    const [activeIdx, setActiveIdx] = useState(0);
    const active = useCases[activeIdx];
    const sectionRef = useRef<HTMLElement>(null);
    const { registerSection } = useTheme();

    useEffect(() => {
        // This section triggers the LIGHT phase
        registerSection('use-cases', 'phase2', sectionRef);
    }, [registerSection]);

    return (
        <section ref={sectionRef} id="use-cases" className="relative bg-grid py-24 sm:py-32">
            <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
                {/* Tabs */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.6 }}
                    className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mb-16"
                >
                    {useCases.map((uc, idx) => (
                        <motion.button
                            key={uc.id}
                            onClick={() => setActiveIdx(idx)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] px-5 py-2.5 rounded-full transition-all duration-300 cursor-pointer"
                            style={{
                                color: idx === activeIdx ? 'var(--phase-cta-text)' : 'var(--phase-text)',
                                backgroundColor: idx === activeIdx ? 'var(--phase-cta-bg)' : 'color-mix(in srgb, var(--phase-border) 40%, transparent)',
                                border: `1px solid ${idx === activeIdx ? 'var(--phase-cta-bg)' : 'var(--phase-border)'}`,
                            }}
                        >
                            <span style={{ opacity: idx === activeIdx ? 1 : 0.6 }} className="transition-opacity duration-300">
                                {uc.icon}
                            </span>
                            {uc.tab}
                        </motion.button>
                    ))}
                </motion.div>

                {/* Tab description */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className="flex items-center justify-center mb-20"
                >
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={active.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.3 }}
                            className="text-center text-lg sm:text-xl max-w-[700px] leading-relaxed phase-text-secondary"
                        >
                            {active.desc}
                        </motion.p>
                    </AnimatePresence>
                </motion.div>

                {/* Section heading */}
                <motion.h2
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="heading-large text-center mb-24"
                >
                    Intelligence in every data point.
                </motion.h2>

                {/* 2-column layout */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={active.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-0 items-stretch"
                    >
                        {/* Window-frame visual */}
                        <div className="window-frame rounded-r-none lg:rounded-l-2xl">
                            <div className="window-dots">
                                <span /><span /><span />
                            </div>
                            <div className="p-6 sm:p-8 min-h-[360px] border-t transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                                {active.visual}
                            </div>
                        </div>

                        {/* Text content */}
                        <div
                            className="border border-l-0 rounded-r-2xl p-8 sm:p-10 flex flex-col justify-center transition-all duration-[600ms]"
                            style={{
                                backgroundColor: 'var(--phase-bg-surface)',
                                borderColor: 'var(--phase-border)',
                            }}
                        >
                            <div className="dot-cluster mb-6">
                                <span /><span /><span /><span />
                            </div>
                            <h3 className="heading-section mb-4">{active.title}</h3>
                            <p className="body-large">{active.desc}</p>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </section>
    );
}
