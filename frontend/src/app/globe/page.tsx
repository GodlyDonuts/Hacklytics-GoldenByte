'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VoiceAgent } from '@/components/VoiceAgent';
import { VoiceChatModal } from '@/components/VoiceChatModal';
import { GlobeProvider } from '@/context/GlobeContext';
import { VoiceAgentProvider } from '@/context/VoiceChatContext';
import { ComparisonPanel } from '@/components/Globe/ComparisonPanel';

const GlobeView = dynamic(() => import('@/components/Globe/GlobeView'), { ssr: false });

export default function GlobeScene() {
    const [chatOpen, setChatOpen] = useState(false);

    return (
        <GlobeProvider>
            <VoiceAgentProvider>
                <div className="relative h-screen w-full overflow-hidden">
                    {/* Globe always full width; voice chat overlays on the right */}
                    <GlobeView />
                    <VoiceChatModal open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />
                </div>
                <VoiceAgent />
                <ComparisonPanel />
            </VoiceAgentProvider>
        </GlobeProvider>
    );
}
