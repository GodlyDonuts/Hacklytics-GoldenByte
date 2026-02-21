'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';

const footerLinks: Record<string, { label: string; href: string }[]> = {
    Product: [
        { label: 'Globe Explorer', href: '/globe' },
        { label: 'Voice Agent', href: '/globe' },
        { label: 'API Documentation', href: '#' },
        { label: 'Data Sources', href: '#resources' },
    ],
    Resources: [
        { label: 'HPC Tools API', href: 'https://hpc.tools' },
        { label: 'HDX HAPI', href: 'https://hapi.humdata.org/' },
        { label: 'Databricks', href: 'https://www.databricks.com/' },
        { label: 'ElevenLabs', href: 'https://elevenlabs.io/' },
    ],
    Project: [
        { label: 'About', href: '#about' },
        { label: 'GitHub', href: '#' },
        { label: 'Hacklytics 2026', href: '#' },
        { label: 'Team GoldenByte', href: '#' },
    ],
};

export default function Footer() {
    const sectionRef = useRef<HTMLElement>(null);
    const { registerSection } = useTheme();

    useEffect(() => {
        // Footer triggers LIGHT phase — same as header area, completing the loop
        registerSection('footer', 'phase4', sectionRef);
    }, [registerSection]);

    return (
        <footer ref={sectionRef}>
            {/* Big final CTA */}
            <div className="bg-grid">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.8 }}
                    className="max-w-[1100px] mx-auto px-6 sm:px-8 py-24 sm:py-32 text-center"
                >
                    <h2 className="heading-massive">
                        See the data. Change the narrative.
                    </h2>
                    <div className="mt-10">
                        <Link
                            href="/globe"
                            className="inline-flex items-center gap-2 text-[14px] font-medium px-8 py-3.5 rounded-full transition-all duration-[600ms]"
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
                    </div>
                </motion.div>
            </div>

            {/* Footer links */}
            <div className="border-t transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="max-w-[1100px] mx-auto px-6 sm:px-8 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 sm:gap-8"
                >
                    {/* Brand */}
                    <div className="lg:col-span-2">
                        <div className="flex items-center gap-2.5 mb-4">
                            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                                <circle cx="16" cy="16" r="14" stroke="var(--phase-accent)" strokeWidth="1.5" />
                                <path d="M6 16h20M16 6c3 4 4.5 7 4.5 10s-1.5 6-4.5 10c-3-4-4.5-7-4.5-10s1.5-6 4.5-10z" stroke="var(--phase-accent)" strokeWidth="1.2" fill="none" />
                            </svg>
                            <span className="text-[15px] font-semibold tracking-tight phase-text">
                                crisis topo
                            </span>
                        </div>
                        <p className="text-[14px] leading-relaxed max-w-[280px] phase-text-muted">
                            Mapping the gap between crisis severity and humanitarian funding allocation. Built at Hacklytics&nbsp;2026.
                        </p>
                    </div>

                    {/* Link columns */}
                    {Object.entries(footerLinks).map(([category, links]) => (
                        <div key={category}>
                            <p className="label-caps mb-4">{category}</p>
                            <ul className="space-y-3">
                                {links.map((link) => (
                                    <li key={link.label}>
                                        <a
                                            href={link.href}
                                            className="text-[14px] phase-text-secondary hover:opacity-80 transition-opacity duration-200"
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Copyright bar */}
            <div className="border-t transition-colors duration-[600ms]" style={{ borderColor: 'var(--phase-border)' }}>
                <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-[12px] phase-text-muted">
                        © 2026 Crisis Topography Command Center — Team GoldenByte
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="#" className="text-[12px] phase-text-muted hover:opacity-80 transition-opacity">Privacy</a>
                        <a href="#" className="text-[12px] phase-text-muted hover:opacity-80 transition-opacity">Terms</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
