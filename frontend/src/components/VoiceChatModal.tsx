'use client';

import React from 'react';
import { useVoiceChat } from '@/context/VoiceChatContext';
import { useGlobeContext } from '@/context/GlobeContext';
import { MessageCircle } from 'lucide-react';

const PANEL_WIDTH = 344;
const TAB_CLASS =
  'flex h-14 w-6 shrink-0 items-center justify-center text-[#00d4ff] shadow-[0_0_12px_rgba(0,212,255,0.2)] transition hover:bg-[#33363b] hover:border-[#00d4ff] hover:shadow-[0_0_16px_rgba(0,212,255,0.3)] border-[#00d4ff]/50 bg-[#2a2d32]/95';

export interface VoiceChatModalProps {
  open: boolean;
  onToggle: () => void;
}

export function VoiceChatModal({ open, onToggle }: VoiceChatModalProps) {
  const {
    sendTextToAgent,
    textInput,
    setTextInput,
    textError,
    hasStarted,
    isSpacePressed,
    isSpeaking,
    status,
  } = useVoiceChat();
  const { viewMode, flyToCoordinates, comparisonData, selectedCountry } = useGlobeContext();

  return (
    <>
      {/* Open tab on the right edge when closed — same style as Data Filters left tab */}
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 rounded-l border border-r-0 transition-all duration-200 ease-out ${TAB_CLASS}`}
          title="Open Voice & Chat"
          aria-label="Open Voice & Chat"
        >
          <MessageCircle className="w-4 h-4 text-[#00d4ff]" aria-hidden />
        </button>
      )}

      {/* Panel overlays on top of globe on the right — no white space */}
      <div
        className="fixed right-0 top-0 bottom-0 flex flex-col z-30 transition-all duration-250 ease-out overflow-hidden"
        style={{ width: open ? PANEL_WIDTH : 0, minWidth: open ? PANEL_WIDTH : 0 }}
      >
        {open && (
          <div className="flex h-full items-stretch">
            {/* Main panel content */}
            <div className="data-filters-modal relative flex flex-1 min-w-0 flex-col overflow-hidden rounded-l-lg border border-r-0 border-[#00d4ff]/40 bg-[#2a2d32] shadow-[0_0_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,212,255,0.2)]">
              {/* Circuit-style background */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: `
                    linear-gradient(90deg, #00d4ff 1px, transparent 1px),
                    linear-gradient(#00d4ff 1px, transparent 1px)
                  `,
                  backgroundSize: '20px 20px',
                }}
              />

              {/* Header */}
              <div className="relative shrink-0 border-b border-[#00d4ff]/40 px-5 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-white flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#00d4ff]" />
                  Voice & Chat
                </h2>
              </div>

              <div className="relative min-h-0  overflow-y-auto p-5 space-y-5">
                {/* Talk to the globe */}
                <section className="border-b border-[#00d4ff]/30 pb-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
                    Talk to the globe
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${isSpacePressed ? 'bg-[#00d4ff] animate-pulse' : 'bg-white/30'}`}
                    />
                    <span className="text-sm text-white/90">
                      {isSpacePressed ? 'Listening…' : 'Hold Space to speak'}
                    </span>
                  </div>
                  {hasStarted && (
                    <p className="text-[10px] text-white/60 mt-1.5">
                      Status: {status}
                      {isSpeaking && ' · Agent speaking'}
                    </p>
                  )}
                </section>

                {/* Text test */}
                <section className="border-b border-[#00d4ff]/30 pb-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
                    Text test
                  </div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendTextToAgent(textInput);
                      }
                    }}
                    placeholder="e.g. Show me Afghanistan"
                    rows={2}
                    className="w-full resize-none rounded border border-[#00d4ff]/40 bg-[#1e2023] px-3 py-2 text-sm text-[#00e5ff] placeholder:text-white/40 outline-none transition focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/50 mb-2"
                  />
                  {textError && (
                    <p className="mb-2 text-xs text-amber-400">{textError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => sendTextToAgent(textInput)}
                    className="w-full rounded border border-[#00d4ff]/50 bg-[#00d4ff]/20 px-3 py-2 text-sm font-medium text-[#00e5ff] shadow-[0_0_8px_rgba(0,212,255,0.3)] transition hover:bg-[#00d4ff]/30"
                  >
                    Send
                  </button>
                  <p className="mt-1.5 text-[10px] uppercase tracking-wider text-white/60">
                    Console: sendAgentText(&quot;your message&quot;)
                  </p>
                </section>

                {/* Current view */}
                <section>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/90">
                    Current view
                  </div>
                  <div className="space-y-2 text-sm text-white/90">
                    <p>
                      <span className="text-white/60">Mode:</span>{' '}
                      <span className="capitalize text-[#00e5ff]">{viewMode.replace('-', ' ')}</span>
                    </p>
                    {flyToCoordinates && (
                      <p>
                        <span className="text-white/60">Focused:</span> lat {flyToCoordinates.lat.toFixed(2)}, lng{' '}
                        {flyToCoordinates.lng.toFixed(2)}
                      </p>
                    )}
                    {selectedCountry && (
                      <p>
                        <span className="text-white/60">Selected:</span> {selectedCountry}
                      </p>
                    )}
                    {comparisonData && (
                      <p>
                        <span className="text-white/60">Comparing:</span>{' '}
                        {comparisonData.sourceIso} vs {comparisonData.targetIso}
                      </p>
                    )}
                    {!flyToCoordinates && !selectedCountry && !comparisonData && (
                      <p className="text-white/60 italic">Ask something to see data here.</p>
                    )}
                  </div>
                </section>
              </div>

              {/* Footer */}
              <div className="relative shrink-0 border-t border-[#00d4ff]/30 bg-[#1e2023]/80 px-5 py-3">
                <div className="text-[10px] uppercase tracking-wider text-white/60">
                  Voice AI · Data on globe
                </div>
              </div>
            </div>

            {/* Close tab — same as Data Filters close tab */}
            <button
              type="button"
              onClick={onToggle}
              className={`rounded-l border border-r-0 ${TAB_CLASS}`}
              aria-label="Close Voice & Chat"
            >
              <span className="text-sm font-bold leading-none" aria-hidden>›</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export const VOICE_CHAT_PANEL_WIDTH = PANEL_WIDTH;
