'use client';

import dynamic from 'next/dynamic';
import { VoiceAgent } from '@/components/VoiceAgent';
import { GlobeProvider } from '@/context/GlobeContext';
import { VoiceAgentProvider } from '@/context/VoiceChatContext';

const GlobeView = dynamic(() => import('@/components/Globe/GlobeView'), { ssr: false });

export default function GlobeScene() {

    return (
        <GlobeProvider>
            <VoiceAgentProvider>
                <div className="relative h-screen w-full overflow-hidden">
                    {/* Globe always full width; voice chat overlays on the right */}
                    <GlobeView />
                </div>
                <VoiceAgent />
            </VoiceAgentProvider>
        </GlobeProvider>
    );
}
