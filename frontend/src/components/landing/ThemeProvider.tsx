'use client';

import React, { useEffect, useRef, createContext, useContext, useState } from 'react';

/*
 * Sphinx-style scroll-triggered theme phases.
 * 
 * Instead of painting individual sections different colors, we watch which
 * section is currently in the viewport and update CSS custom properties on
 * the <html> element.  Because every component reads from these variables,
 * the ENTIRE page — navbar, backgrounds, text, borders — shifts color
 * together as one cohesive phase.
 * 
 * Phases:
 *   phase1 (Hero)     — Deep Midnight Purple (Darkest)
 *   phase2 (Use Cases)— Deep Mocha / Aubergine
 *   phase3 (Features) — Warm Taupe / Clay (Dark text)
 *   phase4 (Footer)   — Warm Sand / Stone (Lightest)
 */

// Phase definitions — all CSS custom properties that change
const PHASES = {
    phase1: {
        '--phase-bg': '#1a1520',
        '--phase-bg-surface': '#211c28',
        '--phase-bg-elevated': '#2a2432',
        '--phase-text': '#ede8e0',
        '--phase-text-secondary': '#9e9590',
        '--phase-text-muted': '#6e6560',
        '--phase-border': 'rgba(255, 255, 255, 0.08)',
        '--phase-accent': '#2dd4a8',
        '--phase-accent-secondary': '#9b6dff',
        '--phase-nav-bg': 'rgba(26, 21, 32, 0.92)',
        '--phase-nav-text': '#6e6560',
        '--phase-nav-text-hover': '#ede8e0',
        '--phase-cta-bg': '#2dd4a8',
        '--phase-cta-text': '#1a1520',
        '--phase-window-bg': '#211c28',
        '--phase-window-border': 'rgba(255, 255, 255, 0.08)',
        '--phase-window-dot': 'rgba(255, 255, 255, 0.1)',
        '--phase-grid-line': 'rgba(255, 255, 255, 0.035)',
    },
    phase2: {
        '--phase-bg': '#362828',
        '--phase-bg-surface': '#453535',
        '--phase-bg-elevated': '#544242',
        '--phase-text': '#f0eaea',
        '--phase-text-secondary': '#b0a3a3',
        '--phase-text-muted': '#857878',
        '--phase-border': 'rgba(255, 255, 255, 0.09)',
        '--phase-accent': '#34d399',
        '--phase-accent-secondary': '#a78bfa',
        '--phase-nav-bg': 'rgba(54, 40, 40, 0.92)',
        '--phase-nav-text': '#857878',
        '--phase-nav-text-hover': '#f0eaea',
        '--phase-cta-bg': '#f0eaea',
        '--phase-cta-text': '#362828',
        '--phase-window-bg': '#453535',
        '--phase-window-border': 'rgba(255, 255, 255, 0.09)',
        '--phase-window-dot': 'rgba(255, 255, 255, 0.12)',
        '--phase-grid-line': 'rgba(255, 255, 255, 0.04)',
    },
    phase3: {
        '--phase-bg': '#baa79d',
        '--phase-bg-surface': '#c9b8b0',
        '--phase-bg-elevated': '#d6c8c1',
        '--phase-text': '#2e2521',
        '--phase-text-secondary': '#5e514b',
        '--phase-text-muted': '#857770',
        '--phase-border': 'rgba(0, 0, 0, 0.08)',
        '--phase-accent': '#059669',
        '--phase-accent-secondary': '#7c3aed',
        '--phase-nav-bg': 'rgba(186, 167, 157, 0.92)',
        '--phase-nav-text': '#5e514b',
        '--phase-nav-text-hover': '#2e2521',
        '--phase-cta-bg': '#2e2521',
        '--phase-cta-text': '#baa79d',
        '--phase-window-bg': '#c9b8b0',
        '--phase-window-border': 'rgba(0, 0, 0, 0.08)',
        '--phase-window-dot': 'rgba(0, 0, 0, 0.12)',
        '--phase-grid-line': 'rgba(0, 0, 0, 0.05)',
    },
    phase4: {
        '--phase-bg': '#e8e0d4',
        '--phase-bg-surface': '#f5eee6',
        '--phase-bg-elevated': '#ffffff',
        '--phase-text': '#2a1f18',
        '--phase-text-secondary': '#5e5248',
        '--phase-text-muted': '#8a7e74',
        '--phase-border': 'rgba(0, 0, 0, 0.08)',
        '--phase-accent': '#1a8a6e',
        '--phase-accent-secondary': '#7c4ddb',
        '--phase-nav-bg': 'rgba(232, 224, 212, 0.92)',
        '--phase-nav-text': '#8a7e74',
        '--phase-nav-text-hover': '#2a1f18',
        '--phase-cta-bg': '#2a1f18',
        '--phase-cta-text': '#e8e0d4',
        '--phase-window-bg': '#ffffff',
        '--phase-window-border': 'rgba(0, 0, 0, 0.08)',
        '--phase-window-dot': 'rgba(0, 0, 0, 0.12)',
        '--phase-grid-line': 'rgba(0, 0, 0, 0.05)',
    },
} as const;

type Phase = keyof typeof PHASES;

interface ThemeContextValue {
    phase: Phase;
    registerSection: (id: string, phase: Phase, ref: React.RefObject<HTMLElement | null>) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    phase: 'phase1',
    registerSection: () => { },
});

export function useTheme() {
    return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [currentPhase, setCurrentPhase] = useState<Phase>('phase1');
    const sectionsRef = useRef<Map<string, { phase: Phase; ref: React.RefObject<HTMLElement | null> }>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);

    const registerSection = (id: string, phase: Phase, ref: React.RefObject<HTMLElement | null>) => {
        sectionsRef.current.set(id, { phase, ref });
    };

    useEffect(() => {
        // Apply CSS custom properties to <html> on phase change
        const root = document.documentElement;
        const vars = PHASES[currentPhase];
        Object.entries(vars).forEach(([prop, value]) => {
            root.style.setProperty(prop, value);
        });
    }, [currentPhase]);

    useEffect(() => {
        // Set initial phase variables
        const root = document.documentElement;
        Object.entries(PHASES.phase1).forEach(([prop, value]) => {
            root.style.setProperty(prop, value);
        });

        // Use IntersectionObserver to detect which section is in view
        // The section whose top edge is closest to the top 40% of viewport wins
        const visibleSections = new Map<string, number>(); // id -> ratio

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const id = entry.target.getAttribute('data-theme-section');
                    if (!id) return;

                    if (entry.isIntersecting) {
                        visibleSections.set(id, entry.intersectionRatio);
                    } else {
                        visibleSections.delete(id);
                    }
                });

                // Find the section that's most visible
                let bestId: string | null = null;
                let bestRatio = 0;

                visibleSections.forEach((ratio, id) => {
                    if (ratio > bestRatio) {
                        bestRatio = ratio;
                        bestId = id;
                    }
                });

                if (bestId) {
                    const section = sectionsRef.current.get(bestId);
                    if (section) {
                        setCurrentPhase(section.phase);
                    }
                }
            },
            {
                threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
                rootMargin: '-20% 0px -40% 0px', // Trigger when section enters top 40% of viewport
            }
        );

        // Observe all registered sections after a tick (to let refs populate)
        const timer = setTimeout(() => {
            sectionsRef.current.forEach(({ ref }, id) => {
                if (ref.current) {
                    ref.current.setAttribute('data-theme-section', id);
                    observerRef.current?.observe(ref.current);
                }
            });
        }, 100);

        return () => {
            clearTimeout(timer);
            observerRef.current?.disconnect();
        };
    }, []);

    return (
        <ThemeContext.Provider value={{ phase: currentPhase, registerSection }}>
            {children}
        </ThemeContext.Provider>
    );
}
