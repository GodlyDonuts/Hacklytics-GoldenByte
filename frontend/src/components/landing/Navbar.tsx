'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';

const navLinks = [
    { label: 'PRODUCT', href: '#product' },
    { label: 'USE CASES', href: '#use-cases' },
    { label: 'RESOURCES', href: '#resources' },
    { label: 'ABOUT', href: '#about' },
];

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-[600ms] ${scrolled
                ? 'backdrop-blur-md border-b shadow-sm'
                : 'bg-transparent border-b border-transparent'
                }`}
            style={{
                backgroundColor: scrolled ? 'var(--phase-nav-bg)' : 'transparent',
                borderColor: scrolled ? 'var(--phase-border)' : 'transparent',
            }}
        >
            <div className="max-w-[1200px] mx-auto px-6 sm:px-8 h-[72px] flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2.5">
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                        <circle cx="16" cy="16" r="14" stroke="var(--phase-accent)" strokeWidth="1.5" style={{ transition: 'stroke 0.6s ease' }} />
                        <path d="M6 16h20M16 6c3 4 4.5 7 4.5 10s-1.5 6-4.5 10c-3-4-4.5-7-4.5-10s1.5-6 4.5-10z" stroke="var(--phase-accent)" strokeWidth="1.2" fill="none" style={{ transition: 'stroke 0.6s ease' }} />
                    </svg>
                    <span
                        className="text-[17px] font-semibold tracking-tight transition-colors duration-[600ms]"
                        style={{ color: 'var(--phase-text)' }}
                    >
                        crisis topo
                    </span>
                </Link>

                {/* Desktop nav */}
                <div className="hidden lg:flex items-center gap-10">
                    {navLinks.map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            className="text-[11px] font-semibold tracking-[0.15em] transition-colors duration-[600ms] hover:opacity-100"
                            style={{ color: 'color-mix(in srgb, var(--phase-nav-text) 80%, white)' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--phase-nav-text-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'color-mix(in srgb, var(--phase-nav-text) 80%, white)'}
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                {/* Desktop CTA */}
                <div className="hidden lg:flex items-center gap-4">
                    <Link
                        href="/globe"
                        className="text-[13px] font-medium px-5 py-2 rounded-full transition-all duration-[600ms]"
                        style={{
                            backgroundColor: 'var(--phase-cta-bg)',
                            color: 'var(--phase-cta-text)',
                        }}
                    >
                        Explore the Globe
                    </Link>
                </div>

                {/* Mobile toggle */}
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="lg:hidden p-2 transition-colors duration-[600ms]"
                    style={{ color: 'var(--phase-text-secondary)' }}
                    aria-label="Menu"
                >
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                        {mobileOpen ? (
                            <path d="M6 6l10 10M16 6L6 16" />
                        ) : (
                            <path d="M3 6h16M3 11h16M3 16h16" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Mobile menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="lg:hidden backdrop-blur-xl overflow-hidden"
                        style={{
                            backgroundColor: 'var(--phase-nav-bg)',
                            borderBottom: '1px solid var(--phase-border)',
                        }}
                    >
                        <div className="px-6 py-6 flex flex-col gap-1">
                            {navLinks.map((link) => (
                                <a
                                    key={link.label}
                                    href={link.href}
                                    onClick={() => setMobileOpen(false)}
                                    className="text-[11px] font-semibold tracking-[0.15em] py-3 transition-colors duration-[600ms]"
                                    style={{ color: 'var(--phase-nav-text)' }}
                                >
                                    {link.label}
                                </a>
                            ))}
                            <Link
                                href="/globe"
                                className="mt-4 text-[13px] font-medium text-center px-5 py-2.5 rounded-full transition-all duration-[600ms]"
                                style={{
                                    backgroundColor: 'var(--phase-cta-bg)',
                                    color: 'var(--phase-cta-text)',
                                }}
                            >
                                Explore the Globe
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}
