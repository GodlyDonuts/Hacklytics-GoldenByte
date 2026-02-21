'use client';

import React from 'react';
import ThemeProvider from '@/components/landing/ThemeProvider';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import UseCaseGrid from '@/components/landing/UseCaseGrid';
import FeatureHighlights from '@/components/landing/FeatureHighlights';
import SocialProof from '@/components/landing/SocialProof';
import TechStack from '@/components/landing/TechStack';
import Footer from '@/components/landing/Footer';

export default function LandingContent() {
    return (
        <ThemeProvider>
            <main className="min-h-screen overflow-x-hidden transition-colors duration-[600ms]" style={{ backgroundColor: 'var(--phase-bg)', color: 'var(--phase-text)' }}>
                <Navbar />
                <Hero />
                <TechStack />
                <UseCaseGrid />
                <FeatureHighlights />
                <SocialProof />
                <Footer />
            </main>
        </ThemeProvider>
    );
}
