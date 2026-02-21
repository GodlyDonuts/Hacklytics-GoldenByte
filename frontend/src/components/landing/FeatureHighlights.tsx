'use client';

import React, { useRef, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { useTheme } from './ThemeProvider';

const features = [
    {
        label: 'SEVERITY AT A GLANCE',
        title: 'Interactive 3D Globe',
        body: 'Choropleth-colored country polygons reveal crisis severity. Toggle heatmap overlays to see funding gap intensity. Click any country for a detailed sector-by-sector breakdown with real-time data from HPC Tools and HDX HAPI.',
        visual: (
            <div className="window-frame">
                <div className="window-dots"><span /><span /><span /></div>
                <div className="p-8 flex items-center justify-center min-h-[320px] border-t transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                    <svg viewBox="0 0 280 280" className="w-full max-w-[260px]">
                        <circle cx="140" cy="140" r="110" stroke="var(--phase-accent)" strokeWidth="0.5" fill="none" opacity="0.3" />
                        <circle cx="140" cy="140" r="90" stroke="var(--phase-accent)" strokeWidth="0.3" fill="none" opacity="0.2" />
                        <ellipse cx="140" cy="140" rx="110" ry="40" stroke="var(--phase-accent)" strokeWidth="0.4" fill="none" opacity="0.25" />
                        <ellipse cx="140" cy="140" rx="80" ry="110" stroke="var(--phase-accent)" strokeWidth="0.3" fill="none" opacity="0.2" />
                        <ellipse cx="140" cy="140" rx="40" ry="110" stroke="var(--phase-accent-secondary)" strokeWidth="0.3" fill="none" opacity="0.15" />
                        <circle cx="105" cy="110" r="12" fill="#ef4444" opacity="0.08" />
                        <circle cx="105" cy="110" r="4" fill="#ef4444" opacity="0.5" />
                        <circle cx="160" cy="130" r="8" fill="#f59e0b" opacity="0.08" />
                        <circle cx="160" cy="130" r="3" fill="#f59e0b" opacity="0.5" />
                        <circle cx="130" cy="165" r="10" fill="var(--phase-accent)" opacity="0.06" />
                        <circle cx="130" cy="165" r="3.5" fill="var(--phase-accent)" opacity="0.4" />
                        <circle cx="175" cy="95" r="6" fill="var(--phase-accent-secondary)" opacity="0.06" />
                        <circle cx="175" cy="95" r="2" fill="var(--phase-accent-secondary)" opacity="0.4" />
                    </svg>
                </div>
            </div>
        ),
    },
    {
        label: 'PATTERN RECOGNITION',
        title: 'ML Anomaly Detection',
        body: 'Isolation Forest models trained on CERF allocation history surface countries where funding-to-need ratios diverge from expected baselines. Each anomaly is auto-scored and overlaid on the globe — no manual SQL or notebook required.',
        visual: (
            <div className="window-frame">
                <div className="window-dots"><span /><span /><span /></div>
                <div className="p-8 min-h-[320px] border-t transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                    <p className="label-caps mb-6">Anomaly Scan — 194 Countries</p>
                    <div className="relative h-[200px] border-l border-b transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                        <span className="absolute -left-16 top-1/2 -rotate-90 text-[10px] tracking-wider phase-text-muted">FUNDING</span>
                        <span className="absolute bottom-[-24px] left-1/2 -translate-x-1/2 text-[10px] tracking-wider phase-text-muted">SEVERITY</span>
                        {[
                            { x: 15, y: 60, r: 3, anomaly: false },
                            { x: 22, y: 55, r: 2.5, anomaly: false },
                            { x: 30, y: 48, r: 3, anomaly: false },
                            { x: 35, y: 42, r: 2, anomaly: false },
                            { x: 42, y: 35, r: 3.5, anomaly: false },
                            { x: 48, y: 30, r: 2.5, anomaly: false },
                            { x: 55, y: 22, r: 3, anomaly: false },
                            { x: 60, y: 18, r: 2, anomaly: false },
                            { x: 65, y: 15, r: 2.5, anomaly: false },
                            { x: 70, y: 12, r: 3, anomaly: false },
                            { x: 78, y: 72, r: 5, anomaly: true },
                            { x: 85, y: 68, r: 4, anomaly: true },
                            { x: 72, y: 65, r: 4, anomaly: true },
                        ].map((pt, i) => (
                            <div
                                key={i}
                                className="absolute rounded-full"
                                style={{
                                    left: `${pt.x}%`,
                                    bottom: `${pt.y}%`,
                                    width: pt.r * 2 + 4,
                                    height: pt.r * 2 + 4,
                                    background: pt.anomaly ? '#ef4444' : 'var(--phase-text-muted)',
                                    opacity: pt.anomaly ? 0.6 : 0.25,
                                    transition: 'background-color 0.6s ease',
                                }}
                            />
                        ))}
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <line x1="10" y1="30" x2="90" y2="85" stroke="var(--phase-accent)" strokeWidth="0.3" opacity="0.3" strokeDasharray="3 3" />
                        </svg>
                    </div>
                    <div className="flex items-center gap-6 mt-8 text-[11px] phase-text-muted">
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full opacity-40" style={{ background: 'var(--phase-text-muted)' }} /> Normal</span>
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ef4444] opacity-60" /> Anomaly</span>
                        <span className="flex items-center gap-2 phase-accent" style={{ opacity: 0.4 }}>--- Baseline</span>
                    </div>
                </div>
            </div>
        ),
    },
    {
        label: 'NATURAL LANGUAGE',
        title: 'Voice-Navigable Intelligence',
        body: 'Hold spacebar and ask anything about humanitarian funding in natural language. The ElevenLabs-powered voice agent queries our Databricks Vector Search index, retrieves relevant context, and narrates actionable insights in real time.',
        visual: (
            <div className="window-frame">
                <div className="window-dots"><span /><span /><span /></div>
                <div className="p-6 sm:p-8 min-h-[320px] border-t transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                    <p className="label-caps mb-5">Voice Session</p>
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-[600ms]"
                                style={{ background: 'color-mix(in srgb, var(--phase-accent) 10%, transparent)' }}
                            >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--phase-accent)" strokeWidth="1.5"><path d="M8 2v12M5 5v6M11 5v6M3 7v2M13 7v2" /></svg>
                            </div>
                            <div
                                className="rounded-xl px-4 py-3 flex-1 transition-all duration-[600ms]"
                                style={{
                                    background: 'color-mix(in srgb, var(--phase-accent) 7%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--phase-accent) 15%, transparent)',
                                }}
                            >
                                <p className="text-[13px] phase-accent">&ldquo;What are the largest disparities in sub-Saharan Africa?&rdquo;</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-[600ms]"
                                style={{ background: 'var(--phase-bg-surface)' }}
                            >
                                <svg width="12" height="12" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" stroke="var(--phase-text-muted)" strokeWidth="1.2" /><path d="M8 16h16M16 8c2.5 3 3.5 5.5 3.5 8s-1 5-3.5 8c-2.5-3-3.5-5.5-3.5-8s1-5 3.5-8z" stroke="var(--phase-text-muted)" strokeWidth="0.8" fill="none" /></svg>
                            </div>
                            <div
                                className="rounded-xl px-4 py-3 flex-1 transition-all duration-[600ms]"
                                style={{ background: 'var(--phase-bg-surface)', border: '1px solid var(--phase-border)' }}
                            >
                                <p className="text-[13px] leading-relaxed phase-text-secondary">
                                    Three countries stand out: <span className="font-medium phase-text">Sudan</span> (score&nbsp;0.87), <span className="font-medium phase-text">Somalia</span> (0.74), and <span className="font-medium phase-text">DRC</span> (0.69). Combined, they represent 38M people in need receiving below-median per-capita funding.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-[11px] phase-text-muted">
                            <kbd
                                className="px-2 py-0.5 rounded font-mono text-[10px] transition-all duration-[600ms]"
                                style={{ background: 'var(--phase-bg-surface)', border: '1px solid var(--phase-border)' }}
                            >space</kbd>
                            <span>Hold to speak</span>
                        </div>
                    </div>
                </div>
            </div>
        ),
    },
];

const sectionVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as const },
    },
};

export default function FeatureHighlights() {
    const sectionRef = useRef<HTMLElement>(null);
    const { registerSection } = useTheme();

    useEffect(() => {
        // Back to DARK phase
        registerSection('features', 'phase3', sectionRef);
    }, [registerSection]);

    return (
        <section ref={sectionRef} id="product" className="bg-grid py-32 sm:py-40">
            <div className="max-w-[1100px] mx-auto px-6 sm:px-8 space-y-32 sm:space-y-40">
                {features.map((feature, idx) => (
                    <motion.div
                        key={idx}
                        variants={sectionVariants}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-100px' }}
                        className={`flex flex-col ${idx % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
                            } items-center gap-12 lg:gap-16`}
                    >
                        <div className="flex-[1.2] w-full">
                            {feature.visual}
                        </div>

                        <div className="flex-1 max-w-[440px]">
                            <div className="dot-cluster mb-6">
                                <span /><span /><span /><span />
                            </div>
                            <p className="text-[10px] font-semibold tracking-[0.15em] uppercase mb-3 phase-accent">{feature.label}</p>
                            <h3 className="heading-section mb-5">{feature.title}</h3>
                            <p className="body-large">{feature.body}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
