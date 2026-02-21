'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';

export default function Hero() {
    const sectionRef = useRef<HTMLElement>(null);
    const { registerSection } = useTheme();

    useEffect(() => {
        registerSection('hero', 'phase1', sectionRef);
    }, [registerSection]);

    return (
        <section
            ref={sectionRef}
            className="relative min-h-screen flex flex-col items-center justify-center bg-grid overflow-hidden"
        >
            {/* Subtle ambient glow */}
            <div
                className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full blur-[180px] pointer-events-none transition-all duration-[600ms]"
                style={{ background: 'color-mix(in srgb, var(--phase-accent) 3%, transparent)' }}
            />

            <div className="relative z-10 max-w-[1000px] mx-auto px-6 text-center pt-28 pb-16">
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                    className="heading-massive"
                >
                    Mapping the crisis funding gap the world ignores.
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                    className="mt-8 text-lg sm:text-xl max-w-[600px] mx-auto leading-relaxed phase-text-secondary"
                >
                    An interactive 3D globe that reveals where humanitarian aid doesn&apos;t reach — powered by ML-driven mismatch detection and voice AI.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="mt-10"
                >
                    <Link
                        href="/globe"
                        className="inline-flex items-center gap-2 text-[14px] font-medium px-7 py-3 rounded-full transition-all duration-[600ms]"
                        style={{
                            backgroundColor: 'var(--phase-cta-bg)',
                            color: 'var(--phase-cta-text)',
                        }}
                    >
                        Explore the Globe
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                    </Link>
                </motion.div>
            </div>

            {/* Hero visual — window frame reads from phase vars */}
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative z-10 w-full max-w-[1100px] mx-auto px-6 pb-4 mt-12 sm:mt-20"
            >
                <div className="window-frame bg-white">
                    <div className="window-dots">
                        <span /><span /><span />
                    </div>

                    <div
                        className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t transition-colors duration-[600ms]"
                        style={{ borderColor: 'var(--phase-border)' }}
                    >
                        {/* Left: Voice prompt */}
                        <div className="md:col-span-1 p-6 sm:p-8 border-r transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                            <div className="space-y-4">
                                <div
                                    className="rounded-xl px-4 py-3 transition-all duration-[600ms]"
                                    style={{
                                        background: 'color-mix(in srgb, var(--phase-accent) 20%, transparent)',
                                        border: '1px solid color-mix(in srgb, var(--phase-accent) 30%, transparent)',
                                    }}
                                >
                                    <p className="text-[13px] font-medium" style={{ color: '#047857' }}>
                                        &ldquo;Show me the most underfunded crises in East Africa&rdquo;
                                    </p>
                                </div>
                                <div
                                    className="rounded-xl px-4 py-3 transition-all duration-[600ms]"
                                    style={{
                                        background: 'var(--phase-bg-surface)',
                                        border: '1px solid var(--phase-border)',
                                    }}
                                >
                                    <p className="text-[13px] leading-relaxed text-[#333333]">
                                        Sudan leads with 24.8M people in need but only $33.87 per capita — a mismatch score of&nbsp;
                                        <span className="font-medium text-black">0.87</span>. Somalia follows at 0.74.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Center: Globe wireframe */}
                        <div className="md:col-span-1 p-8 flex flex-col items-center justify-center min-h-[280px]">
                            <motion.svg
                                animate={{ rotate: 360 }}
                                transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
                                viewBox="0 0 200 200" className="w-40 h-40 opacity-50"
                            >
                                <circle cx="100" cy="100" r="75" stroke="var(--phase-accent)" strokeWidth="0.6" fill="none" />
                                <ellipse cx="100" cy="100" rx="75" ry="28" stroke="var(--phase-accent)" strokeWidth="0.4" fill="none" />
                                <ellipse cx="100" cy="100" rx="28" ry="75" stroke="var(--phase-accent)" strokeWidth="0.4" fill="none" />
                                <ellipse cx="100" cy="100" rx="52" ry="75" stroke="var(--phase-accent-secondary)" strokeWidth="0.3" fill="none" transform="rotate(25 100 100)" />

                                <motion.circle
                                    animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    cx="80" cy="72" r="6" fill="#ef4444"
                                />
                                <circle cx="80" cy="72" r="2" fill="#ef4444" opacity="0.7" />

                                <motion.circle
                                    animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2.5, delay: 0.5, repeat: Infinity, ease: "easeInOut" }}
                                    cx="118" cy="88" r="4" fill="#f59e0b"
                                />
                                <circle cx="118" cy="88" r="1.5" fill="#f59e0b" opacity="0.7" />

                                <motion.circle
                                    animate={{ opacity: [0.1, 0.6, 0.1], scale: [1, 1.1, 1] }}
                                    transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
                                    cx="95" cy="115" r="5" fill="var(--phase-accent)"
                                />
                                <circle cx="95" cy="115" r="2" fill="var(--phase-accent)" opacity="0.6" />
                            </motion.svg>
                            <p className="text-[10px] label-caps mt-4">Live Crisis Map</p>
                        </div>

                        {/* Right: Data table */}
                        <div className="md:col-span-1 p-6 sm:p-8 border-l transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                            <p className="label-caps mb-4 text-[#333333]">Mismatch Ranking</p>
                            <div className="space-y-3">
                                {[
                                    { country: 'Sudan', score: '0.87', ppl: '24.8M', color: '#ef4444' },
                                    { country: 'Yemen', score: '0.82', ppl: '21.6M', color: '#ef4444' },
                                    { country: 'Somalia', score: '0.74', ppl: '8.3M', color: '#f59e0b' },
                                    { country: 'Haiti', score: '0.68', ppl: '5.5M', color: '#f59e0b' },
                                ].map((row) => (
                                    <div
                                        key={row.country}
                                        className="flex items-center justify-between py-2 border-b last:border-0 transition-colors duration-[600ms]"
                                        style={{ borderColor: 'var(--phase-border)' }}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                                            <span className="text-[13px] text-[#333333] font-medium">{row.country}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[12px] font-mono text-[#4b5563]">{row.ppl}</span>
                                            <span className="text-[13px] font-mono font-bold text-[#111827]">{row.score}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
