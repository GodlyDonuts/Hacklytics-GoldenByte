'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useConversation } from '@elevenlabs/react';
import { useGlobeContext } from '@/context/GlobeContext';

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || 'agent_1201khzd23t9fsaramppkhnftan0';

declare global {
  interface Window {
    sendAgentText?: (text: string) => void;
  }
}

type VoiceChatContextValue = {
  sendTextToAgent: (text: string) => Promise<void>;
  textInput: string;
  setTextInput: (v: string) => void;
  textError: string | null;
  hasStarted: boolean;
  isSpacePressed: boolean;
  isSpeaking: boolean;
  status: string;
  startVoiceSession: () => Promise<void>;
};

const VoiceChatContext = createContext<VoiceChatContextValue | null>(null);

export function VoiceAgentProvider({ children }: { children: ReactNode }) {
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const { setFlyToCoordinates, setComparisonData, setViewMode } = useGlobeContext();
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const conversation = useConversation({
    onConnect: () => console.log('VoiceAgent connected'),
    onDisconnect: () => {
      console.log('VoiceAgent disconnected');
      setHasStarted(false);
    },
    onError: (error) => console.error('VoiceAgent error:', error),
    micMuted: !isSpacePressed,
    clientTools: {
      show_location_on_globe: (parameters: { lat: number; lng: number }) => {
        setFlyToCoordinates({
          lat: parameters.lat,
          lng: parameters.lng,
          altitude: 1.5,
        });
        return 'Successfully moved the globe.';
      },
      change_view_mode: (parameters: { mode: 'severity' | 'funding-gap' | 'anomalies' }) => {
        setViewMode(parameters.mode);
        return `Successfully changed the view mode to ${parameters.mode}.`;
      },
      compare_countries: (parameters: {
        sourceIso: string;
        targetIso: string;
        sourceLat: number;
        sourceLng: number;
        targetLat: number;
        targetLng: number;
        sourceStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number };
        targetStats: { mismatch: number; peopleInNeed: number; risk: number; severity: number; gap: number };
      }) => {
        setFlyToCoordinates({
          lat: parameters.sourceLat,
          lng: parameters.sourceLng,
          altitude: 2.0,
        });
        setComparisonData({
          sourceIso: parameters.sourceIso,
          targetIso: parameters.targetIso,
          sourceLat: parameters.sourceLat,
          sourceLng: parameters.sourceLng,
          targetLat: parameters.targetLat,
          targetLng: parameters.targetLng,
          sourceStats: parameters.sourceStats,
          targetStats: parameters.targetStats,
        });
        return 'Successfully compared the countries. The user can now see the visualization.';
      },
      end_conversation: () => {
        setHasStarted(false);
        return 'Conversation ended.';
      },
    },
  });

  conversationRef.current = conversation;

  useEffect(() => {
    if (!hasStarted && conversation.status === 'connected') {
      conversation.endSession();
    }
  }, [hasStarted, conversation]);

  const startVoiceSession = useCallback(async () => {
    try {
      if (conversation.status === 'connected' || conversation.status === 'connecting') return;
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({ agentId: AGENT_ID, connectionType: 'websocket' });
      setHasStarted(true);
    } catch (err) {
      console.error('Failed to start ElevenLabs session', err);
    }
  }, [conversation]);

  const startSessionForText = useCallback(async () => {
    try {
      if (conversation.status === 'connected' || conversation.status === 'connecting') return true;
      await conversation.startSession({ agentId: AGENT_ID, connectionType: 'websocket' });
      setHasStarted(true);
      return true;
    } catch (err) {
      console.error('Failed to start session for text', err);
      return false;
    }
  }, [conversation]);

  const sendTextToAgent = useCallback(
    async (text: string) => {
      setTextError(null);
      const t = text.trim();
      if (!t) return;
      try {
        if (conversation.status !== 'connected') {
          const started = await startSessionForText();
          if (!started) {
            setTextError(
              'Could not connect. Try holding Space and allowing the microphone once, then use this again.'
            );
            return;
          }
        }
        conversation.sendUserMessage(t);
        setTextInput('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTextError(msg);
        console.error('sendUserMessage failed', err);
      }
    },
    [conversation, startSessionForText]
  );

  useEffect(() => {
    window.sendAgentText = (text: string) => {
      if (conversationRef.current) sendTextToAgent(text);
      else console.warn('VoiceAgent not ready yet.');
    };
    return () => {
      delete window.sendAgentText;
    };
  }, [sendTextToAgent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
      if (e.code === 'Space' && !e.repeat && !isInput) {
        e.preventDefault();
        setIsSpacePressed(true);
        if (
          !hasStarted &&
          conversation.status !== 'connected' &&
          conversation.status !== 'connecting'
        ) {
          startVoiceSession();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hasStarted, conversation.status, startVoiceSession]);

  const value: VoiceChatContextValue = {
    sendTextToAgent,
    textInput,
    setTextInput,
    textError,
    hasStarted,
    isSpacePressed,
    isSpeaking: conversation.isSpeaking ?? false,
    status: conversation.status,
    startVoiceSession,
  };

  return (
    <VoiceChatContext.Provider value={value}>
      {children}
    </VoiceChatContext.Provider>
  );
}

export function useVoiceChat(): VoiceChatContextValue {
  const ctx = useContext(VoiceChatContext);
  if (!ctx) throw new Error('useVoiceChat must be used within VoiceAgentProvider');
  return ctx;
}
