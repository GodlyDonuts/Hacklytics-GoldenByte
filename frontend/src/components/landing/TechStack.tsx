'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';

// ─── Tech stack items ─────────────────────────────────────────────────────────
// Each item has a label and an SVG icon rendered inline.
const TECH_ITEMS = [
    {
        label: 'Next.js',
        icon: (
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <circle cx="50" cy="50" r="50" fill="#000000" />
                <path d="M28 72V28l44 44V28" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
        ),
    },
    {
        label: 'FastAPI',
        icon: (
            <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <path d="M64 0a64 64 0 1 0 0 128A64 64 0 0 0 64 0z" fill="#059669" />
                <path d="M71.9 24L40 68h27.7L56.3 104l40.5-52H68.2L71.9 24z" fill="white" />
            </svg>
        ),
    },
    {
        label: 'Google Gemini',
        icon: (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <defs>
                    <linearGradient id="gem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4285F4" />
                        <stop offset="50%" stopColor="#9C27B0" />
                        <stop offset="100%" stopColor="#FF3D00" />
                    </linearGradient>
                </defs>
                <path d="M12 2C12 2 7 7.5 7 12s5 10 5 10 5-4.5 5-10S12 2 12 2z" fill="url(#gem-grad)" opacity="0.9" />
                <path d="M2 12c0 0 5.5 5 10 5s10-5 10-5-4.5-5-10-5S2 12 2 12z" fill="url(#gem-grad)" opacity="0.6" />
            </svg>
        ),
    },
    {
        label: 'ElevenLabs',
        icon: (
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <rect width="100" height="100" rx="20" fill="#1a1a1a" />
                <rect x="30" y="20" width="14" height="60" rx="7" fill="white" />
                <rect x="56" y="20" width="14" height="60" rx="7" fill="white" />
            </svg>
        ),
    },
    {
        label: 'Databricks',
        icon: (
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <rect width="100" height="100" rx="10" fill="#FF3621" />
                <path d="M50 15L80 32v22L50 70 20 54V32L50 15z" fill="white" opacity="0.95" />
                <path d="M50 45L80 62v18L50 85 20 80V62L50 45z" fill="white" opacity="0.6" />
            </svg>
        ),
    },
    {
        label: 'Three.js',
        icon: (
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <rect width="100" height="100" rx="10" fill="#000000" />
                <polygon points="50,15 85,80 15,80" fill="none" stroke="white" strokeWidth="5" />
                <polygon points="50,35 70,70 30,70" fill="white" opacity="0.5" />
            </svg>
        ),
    },
    {
        label: 'Python',
        icon: (
            <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <defs>
                    <linearGradient id="py-top" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#387EB8" />
                        <stop offset="100%" stopColor="#366994" />
                    </linearGradient>
                    <linearGradient id="py-bot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFE052" />
                        <stop offset="100%" stopColor="#FFC331" />
                    </linearGradient>
                </defs>
                <path d="M63.4 5C49.2 5 50 11.3 50 11.3V22h14v3H31S18 23.7 18 38c0 14.3 7.9 13.8 7.9 13.8H33V43s-.4-7.9 7.8-7.9H72s7.5.1 7.5-7.2V15.5S81 5 63.4 5zM54 15.3a2.9 2.9 0 110-5.8 2.9 2.9 0 010 5.8z" fill="url(#py-top)" />
                <path d="M64.6 123C78.8 123 78 116.7 78 116.7V106H64v-3H97S110 104.3 110 90c0-14.3-7.9-13.8-7.9-13.8H95V85s.4 7.9-7.8 7.9H56s-7.5-.1-7.5 7.2v16.4S47 123 64.6 123zM74 112.7a2.9 2.9 0 110 5.8 2.9 2.9 0 010-5.8z" fill="url(#py-bot)" />
            </svg>
        ),
    },
    {
        label: 'PostgreSQL',
        icon: (
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <ellipse cx="50" cy="30" rx="32" ry="20" fill="#336791" />
                <rect x="18" y="30" width="64" height="44" fill="#336791" />
                <ellipse cx="50" cy="74" rx="32" ry="10" fill="#254F70" />
                <ellipse cx="50" cy="30" rx="32" ry="10" fill="#4A8CC0" opacity="0.7" />
                <path d="M60 20 Q72 10 70 30" stroke="white" strokeWidth="3" fill="none" opacity="0.6" />
            </svg>
        ),
    },
];

// ─── Center logo: Project logo (golden byte globe) ────────────────────────────
function CenterLogo() {
    return (
        <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
                <defs>
                    <linearGradient id="center-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="38" stroke="url(#center-grad)" strokeWidth="4" fill="none" />
                <ellipse cx="50" cy="50" rx="38" ry="14" stroke="url(#center-grad)" strokeWidth="2.5" fill="none" />
                <ellipse cx="50" cy="50" rx="14" ry="38" stroke="url(#center-grad)" strokeWidth="2.5" fill="none" />
                <circle cx="50" cy="50" r="6" fill="url(#center-grad)" />
            </svg>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TechStack() {
    const sectionRef = useRef<HTMLElement>(null);
    const { registerSection } = useTheme();

    useEffect(() => {
        registerSection('tech-stack', 'phase2', sectionRef);
    }, [registerSection]);

    const ORBIT_RADIUS = 160; // px, distance of icons from center

    return (
        <section ref={sectionRef} className="relative py-32 sm:py-40 overflow-hidden">
            {/* Ambient glow behind spinner */}
            <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none"
                style={{ background: 'color-mix(in srgb, var(--phase-accent) 6%, transparent)' }}
            />

            {/* Section heading */}
            <div className="relative z-10 text-center mb-16 px-6">
                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6 }}
                    className="label-caps mb-3"
                    style={{ color: 'var(--phase-accent)' }}
                >
                    Built with
                </motion.p>
                <motion.h2
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="text-[32px] sm:text-[42px] font-bold tracking-tight phase-text"
                >
                    Our Tech Stack
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mt-4 text-[15px] max-w-[480px] mx-auto leading-relaxed phase-text-secondary"
                >
                    A full-stack AI platform assembled from best-in-class tools for data, ML, and voice.
                </motion.p>
            </div>

            {/* Spinner container */}
            <div className="relative z-10 flex items-center justify-center" style={{ height: `${ORBIT_RADIUS * 2 + 120}px` }}>
                {/* Rotating ring with icons */}
                <motion.div
                    className="absolute"
                    style={{ width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2 }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                >
                    {/* Subtle orbit track */}
                    <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox={`0 0 ${ORBIT_RADIUS * 2} ${ORBIT_RADIUS * 2}`}
                    >
                        <circle
                            cx={ORBIT_RADIUS}
                            cy={ORBIT_RADIUS}
                            r={ORBIT_RADIUS - 4}
                            stroke="var(--phase-border)"
                            strokeWidth="1"
                            fill="none"
                            strokeDasharray="4 8"
                        />
                        {/* Connection lines from center to each icon */}
                        {TECH_ITEMS.map((_, i) => {
                            const angle = (i / TECH_ITEMS.length) * 2 * Math.PI - Math.PI / 2;
                            const x = ORBIT_RADIUS + (ORBIT_RADIUS - 4) * Math.cos(angle);
                            const y = ORBIT_RADIUS + (ORBIT_RADIUS - 4) * Math.sin(angle);
                            return (
                                <line
                                    key={i}
                                    x1={ORBIT_RADIUS}
                                    y1={ORBIT_RADIUS}
                                    x2={x}
                                    y2={y}
                                    stroke="var(--phase-border)"
                                    strokeWidth="1"
                                    opacity="0.5"
                                />
                            );
                        })}
                    </svg>

                    {/* Tech icons orbiting */}
                    {TECH_ITEMS.map((tech, i) => {
                        const angle = (i / TECH_ITEMS.length) * 2 * Math.PI - Math.PI / 2;
                        const x = ORBIT_RADIUS + (ORBIT_RADIUS - 4) * Math.cos(angle);
                        const y = ORBIT_RADIUS + (ORBIT_RADIUS - 4) * Math.sin(angle);

                        return (
                            <div
                                key={tech.label}
                                className="absolute"
                                style={{
                                    left: x,
                                    top: y,
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                {/* Counter-rotate so icons stay upright */}
                                <motion.div
                                    animate={{ rotate: -360 }}
                                    transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                                    className="group relative flex flex-col items-center gap-1.5 cursor-default"
                                >
                                    <div
                                        className="w-[52px] h-[52px] rounded-full bg-white shadow-md flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                                        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}
                                    >
                                        {tech.icon}
                                    </div>
                                    {/* Label on hover */}
                                    <span
                                        className="absolute -bottom-6 whitespace-nowrap text-[10px] font-semibold tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                        style={{ color: 'var(--phase-accent)' }}
                                    >
                                        {tech.label}
                                    </span>
                                </motion.div>
                            </div>
                        );
                    })}
                </motion.div>

                {/* Center hub — does NOT rotate */}
                <div className="relative z-20 flex flex-col items-center gap-2">
                    <div
                        className="w-24 h-24 rounded-full flex items-center justify-center shadow-xl"
                        style={{
                            background: 'color-mix(in srgb, var(--phase-accent) 15%, var(--phase-bg-surface))',
                            border: '2px solid color-mix(in srgb, var(--phase-accent) 30%, transparent)',
                        }}
                    >
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                            <defs>
                                <linearGradient id="hub-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#d97706" />
                                </linearGradient>
                            </defs>
                            <circle cx="50" cy="50" r="38" stroke="url(#hub-grad)" strokeWidth="4" fill="none" />
                            <ellipse cx="50" cy="50" rx="38" ry="14" stroke="url(#hub-grad)" strokeWidth="2.5" fill="none" />
                            <ellipse cx="50" cy="50" rx="14" ry="38" stroke="url(#hub-grad)" strokeWidth="2.5" fill="none" />
                            <circle cx="50" cy="50" r="5" fill="url(#hub-grad)" />
                        </svg>
                    </div>
                    <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--phase-accent)' }}>
                        GoldenByte
                    </p>
                </div>
            </div>

            {/* Tech labels row beneath spinner */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="relative z-10 flex flex-wrap justify-center gap-2 mt-12 px-6 max-w-[680px] mx-auto"
            >
                {TECH_ITEMS.map((tech) => (
                    <span
                        key={tech.label}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold tracking-wide uppercase transition-all duration-300 hover:scale-105"
                        style={{
                            background: 'transparent',
                            border: '1px solid color-mix(in srgb, var(--phase-accent) 25%, var(--phase-border))',
                            color: 'var(--phase-text-secondary, var(--phase-text))',
                            letterSpacing: '0.08em',
                        }}
                    >
                        <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: 'var(--phase-accent)' }}
                        />
                        {tech.label}
                    </span>
                ))}
            </motion.div>
        </section>
    );
}
