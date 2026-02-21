"use client";

import { useVoiceChat } from "@/context/VoiceChatContext";

/** Visual overlay only: aurora, Hold Space hint, agent speaking indicator. Voice logic lives in VoiceAgentProvider. */
export function VoiceAgent() {
    const { isSpacePressed, hasStarted, isSpeaking } = useVoiceChat();

    return (
        <>
            {/* Premium Aurora Effect when space is pressed */}
            <div
                className={`fixed bottom-0 left-0 w-full h-[25vh] pointer-events-none z-40 transition-all duration-1000 ease-in-out ${isSpacePressed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
                    }`}
            >
                <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-emerald-500/10 via-cyan-500/5 to-transparent mix-blend-screen" />
                <div className="aurora-1 absolute -bottom-[15vh] left-[0%] w-[40vw] h-[30vh] bg-emerald-400 rounded-full mix-blend-screen blur-[120px] opacity-60" />
                <div className="aurora-2 absolute -bottom-[20vh] left-[30%] w-[50vw] h-[30vh] bg-cyan-400 rounded-full mix-blend-screen blur-[140px] opacity-50" />
                <div className="aurora-3 absolute -bottom-[15vh] left-[60%] w-[40vw] h-[30vh] bg-blue-500 rounded-full mix-blend-screen blur-[120px] opacity-60" />
                <div className="pulse-soft absolute -bottom-[10vh] left-[45%] w-[10vw] h-[15vh] bg-white rounded-full mix-blend-screen blur-[100px] opacity-40" />
            </div>

            {/* Hold Space hint */}
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-700 font-sans tracking-[0.2em] text-xs uppercase ${isSpacePressed
                ? 'opacity-0 translate-y-4'
                : 'opacity-50 text-white translate-y-0'
                }`}>
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
                    Hold Space
                    <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
                </div>
            </div>

            {/* Agent speaking indicator */}
            {hasStarted && isSpeaking && !isSpacePressed && (
                <div className="fixed bottom-0 left-0 w-full h-[20vh] pointer-events-none z-30 transition-all duration-1000 ease-in-out opacity-80">
                    <div className="pulse-soft absolute -bottom-[10vh] left-[40%] w-[20vw] h-[15vh] bg-blue-400 rounded-full mix-blend-screen blur-[120px]" />
                </div>
            )}
        </>
    );
}
