'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';

export default function SocialProof() {
    const sectionRef = useRef<HTMLElement>(null);
    const { registerSection } = useTheme();

    useEffect(() => {
        // Stays DARK
        registerSection('social-proof', 'phase4', sectionRef);
    }, [registerSection]);

    return (
        <section ref={sectionRef} id="about" className="relative bg-grid py-32 sm:py-40">
            <div className="max-w-[900px] mx-auto px-6 sm:px-8">
                {/* Dot cluster divider */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6 }}
                    className="flex justify-center mb-16"
                >
                    <div className="dot-cluster">
                        <span /><span /><span /><span />
                    </div>
                </motion.div>

                {/* Quote */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="relative flex flex-col items-center text-center max-w-[800px] mx-auto py-12"
                >
                    <span
                        className="absolute top-0 -translate-y-6 text-[100px] sm:text-[140px] leading-none font-serif select-none opacity-20 transition-all duration-[600ms]"
                        style={{ color: 'var(--phase-accent)' }}
                    >
                        &ldquo;
                    </span>

                    <blockquote className="relative z-10 text-[26px] sm:text-[32px] md:text-[40px] italic font-medium leading-[1.2] tracking-tight phase-text drop-shadow-md">
                        Every dollar misallocated in humanitarian aid is a life left in the balance. We built this to make that invisible gap impossible to ignore.
                    </blockquote>
                    <div className="mt-8">
                        <p className="text-[14px] font-bold tracking-[0.2em] uppercase phase-accent">
                            Team GoldenByte
                        </p>
                        <p className="text-[13px] mt-1 phase-text-muted">
                            Hacklytics 2026
                        </p>
                    </div>
                </motion.div>

                {/* Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mt-24 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden transition-all duration-[600ms]"
                    style={{ background: 'var(--phase-border)' }}
                >
                    {[
                        { value: '190+', label: 'Countries Mapped' },
                        { value: '24.8M', label: 'People in Need Tracked' },
                        { value: '$2.8B', label: 'Funding Analyzed' },
                        { value: '5.5×', label: 'Largest Disparity' },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className="group px-6 py-10 text-center transition-all duration-[600ms] hover:bg-opacity-80 cursor-default"
                            style={{ backgroundColor: 'var(--phase-bg-surface)' }}
                        >
                            <p className="text-[28px] sm:text-[34px] font-bold tracking-tight font-mono phase-accent group-hover:scale-105 transition-transform duration-500">
                                {stat.value}
                            </p>
                            <p className="mt-2 text-[12px] tracking-wider uppercase phase-text-muted">
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
