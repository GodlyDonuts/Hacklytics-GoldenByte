'use client';

import dynamic from 'next/dynamic';
import { VoiceAgent } from '@/components/VoiceAgent';
import { GlobeProvider } from '@/context/GlobeContext';

const GlobeView = dynamic(() => import('@/components/Globe/GlobeView'), { ssr: false });

export default function GlobeScene() {
    return (
        <GlobeProvider>
            <div className="relative min-h-screen w-full">
                <GlobeView />
                <VoiceAgent />
            </div>
        </GlobeProvider>
    );
}
