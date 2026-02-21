"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useState, useEffect } from "react";
import { useGlobeContext } from "@/context/GlobeContext";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "agent_1201khzd23t9fsaramppkhnftan0";

export function VoiceAgent() {
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const { setFlyToCoordinates, setComparisonData, setViewMode } = useGlobeContext();

    // We pass micMuted dynamic state directly to the hook
    const conversation = useConversation({
        onConnect: () => {
            console.log("VoiceAgent connected");
        },
        onDisconnect: () => {
            console.log("VoiceAgent disconnected");
            setHasStarted(false);
        },
        onError: (error) => console.error("VoiceAgent error:", error),
        micMuted: !isSpacePressed,
        clientTools: {
            show_location_on_globe: (parameters: { lat: number; lng: number }) => {
                console.log("AI called show_location_on_globe:", parameters);
                setFlyToCoordinates({
                    lat: parameters.lat,
                    lng: parameters.lng,
                    altitude: 1.5
                });
                return "Successfully moved the globe.";
            },
            change_view_mode: (parameters: { mode: 'severity' | 'funding-gap' | 'anomalies' }) => {
                console.log("AI called change_view_mode:", parameters);
                setViewMode(parameters.mode);
                return `Successfully changed the view mode to ${parameters.mode}.`;
            },
            compare_countries: (parameters: {
                sourceIso: string; targetIso: string;
                sourceLat: number; sourceLng: number;
                targetLat: number; targetLng: number;
                sourceStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number; };
                targetStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number; };
            }) => {
                console.log("AI called compare_countries:", parameters);
                setFlyToCoordinates({
                    lat: parameters.sourceLat,
                    lng: parameters.sourceLng,
                    altitude: 2.0
                });
                setComparisonData({
                    sourceIso: parameters.sourceIso,
                    targetIso: parameters.targetIso,
                    sourceLat: parameters.sourceLat,
                    sourceLng: parameters.sourceLng,
                    targetLat: parameters.targetLat,
                    targetLng: parameters.targetLng,
                    sourceStats: parameters.sourceStats,
                    targetStats: parameters.targetStats
                });
                return "Successfully compared the countries. The user can now see the visualization.";
            },
            end_conversation: (parameters: {}) => {
                console.log("AI called end_conversation:", parameters);
                // We'll set hasStarted to false to reset UI, and rely on the useEffect below to actually end the session
                setHasStarted(false);
                return "Conversation ended.";
            }
        }
    });

    useEffect(() => {
        if (!hasStarted && conversation.status === "connected") {
            conversation.endSession();
        }
    }, [hasStarted, conversation]);

    const startVoiceSession = useCallback(async () => {
        try {
            if (conversation.status === "connected" || conversation.status === "connecting") return;
            await navigator.mediaDevices.getUserMedia({ audio: true });
            await conversation.startSession({ agentId: AGENT_ID, connectionType: "websocket" });
            setHasStarted(true);
        } catch (err) {
            console.error("Failed to start ElevenLabs session", err);
        }
    }, [conversation]);

    // Handle Spacebar interactions globally
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

            if (e.code === "Space" && !e.repeat && !isInput) {
                e.preventDefault(); // Prevent page scrolling
                setIsSpacePressed(true);

                // Auto-connect on the first time they ever press space
                if (!hasStarted && conversation.status !== "connected" && conversation.status !== "connecting") {
                    startVoiceSession();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                setIsSpacePressed(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [hasStarted, conversation.status, startVoiceSession]);

    return (
        <>
            {/* Premium Aurora Effect showing when space is pressed */}
            <div
                className={`fixed bottom-0 left-0 w-full h-[25vh] pointer-events-none z-40 transition-all duration-1000 ease-in-out ${isSpacePressed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
                    }`}
            >
                <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-emerald-500/10 via-cyan-500/5 to-transparent mix-blend-screen" />

                {/* Organic Animated Blobs */}
                <div className="aurora-1 absolute -bottom-[15vh] left-[0%] w-[40vw] h-[30vh] bg-emerald-400 rounded-full mix-blend-screen blur-[120px] opacity-60" />
                <div className="aurora-2 absolute -bottom-[20vh] left-[30%] w-[50vw] h-[30vh] bg-cyan-400 rounded-full mix-blend-screen blur-[140px] opacity-50" />
                <div className="aurora-3 absolute -bottom-[15vh] left-[60%] w-[40vw] h-[30vh] bg-blue-500 rounded-full mix-blend-screen blur-[120px] opacity-60" />
                <div className="pulse-soft absolute -bottom-[10vh] left-[45%] w-[10vw] h-[15vh] bg-white rounded-full mix-blend-screen blur-[100px] opacity-40" />
            </div>

            {/* Subtle Hint Text */}
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

            {/* Very faint agent speaking indicator */}
            {hasStarted && conversation.isSpeaking && !isSpacePressed && (
                <div className="fixed bottom-0 left-0 w-full h-[20vh] pointer-events-none z-30 transition-all duration-1000 ease-in-out opacity-80">
                    <div className="pulse-soft absolute -bottom-[10vh] left-[40%] w-[20vw] h-[15vh] bg-blue-400 rounded-full mix-blend-screen blur-[120px]" />
                </div>
            )}
        </>
    );
}
