'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useConversation } from '@elevenlabs/react';
import { useRouter } from 'next/navigation';
import { useGlobeContext } from '@/context/GlobeContext';
import { generateReport, getPredictiveRisks } from '@/lib/api';
import { pushActivity, resolveActivity } from '@/components/Globe/AgentActivityFeed';

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
  isVoiceActive: boolean;
  startVoiceSession: () => Promise<void>;
};

const VoiceChatContext = createContext<VoiceChatContextValue | null>(null);

export function VoiceAgentProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const { setFlyToCoordinates, setComparisonData, setViewMode, setGenieChartData, setSelectedCountry, setIsSpotlightActive, setFilters, setPredictiveRisks, nearestSpotlightIso, selectedCountry, comparisonData } = useGlobeContext();
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const globeStateRef = useRef({ selectedCountry, comparisonData });
  const lastNavigatedIso3Ref = useRef<string | null>(null);
  const nearestSpotlightIsoRef = useRef<string | null>(nearestSpotlightIso);
  useEffect(() => {
    globeStateRef.current = { selectedCountry, comparisonData };
    nearestSpotlightIsoRef.current = nearestSpotlightIso;
  }, [selectedCountry, comparisonData, nearestSpotlightIso]);

  const conversation = useConversation({
    onConnect: () => console.log('VoiceAgent connected'),
    onDisconnect: () => {
      console.log('VoiceAgent disconnected');
      setHasStarted(false);
    },
    onError: (error) => console.error('VoiceAgent error:', error),
    micMuted: !isSpacePressed,
    clientTools: {
      show_location_on_globe: (parameters: { lat: number; lng: number; iso3?: string }) => {
        const aid = pushActivity('show_location_on_globe', 'Flying to location', parameters.iso3 ?? `${parameters.lat.toFixed(1)}, ${parameters.lng.toFixed(1)}`);
        setFlyToCoordinates({
          lat: parameters.lat,
          lng: parameters.lng,
          altitude: 1.5,
        });
        if (parameters.iso3) {
          lastNavigatedIso3Ref.current = parameters.iso3;
          setSelectedCountry(parameters.iso3);
          setIsSpotlightActive(true);
        }
        resolveActivity(aid, 'done', parameters.iso3 ? `Focused on ${parameters.iso3}` : undefined);
        return 'Successfully moved the globe.';
      },
      change_view_mode: (parameters: { mode: 'severity' | 'funding-gap' | 'anomalies' }) => {
        const modeLabels: Record<string, string> = { severity: 'Severity', 'funding-gap': 'Funding Gap', anomalies: 'Overlooked' };
        const aid = pushActivity('change_view_mode', 'Switching view mode', modeLabels[parameters.mode] ?? parameters.mode);
        setViewMode(parameters.mode);
        resolveActivity(aid, 'done');
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
        const aid = pushActivity('compare_countries', 'Comparing countries', `${parameters.sourceIso} vs ${parameters.targetIso}`);
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
        resolveActivity(aid, 'done');
        return 'Successfully compared the countries. The user can now see the visualization.';
      },
      query_data: async (parameters: { question: string }) => {
        const aid = pushActivity('query_data', 'Querying Databricks', parameters.question);
        try {
          const resp = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/genie`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question: parameters.question }),
            }
          );
          if (!resp.ok) {
            resolveActivity(aid, 'error', `HTTP ${resp.status}`);
            return `Query failed: HTTP ${resp.status}`;
          }
          const data = await resp.json();
          setGenieChartData({
            question: parameters.question,
            columns: data.columns || [],
            rows: data.rows || [],
            description: data.description,
            sql: data.sql,
          });
          const rowCount = (data.rows || []).length;
          resolveActivity(aid, 'done', `${rowCount} result${rowCount !== 1 ? 's' : ''} returned`);
          return data.description || 'Query completed. Results are displayed on screen.';
        } catch (err) {
          resolveActivity(aid, 'error', err instanceof Error ? err.message : 'Failed');
          return `Query failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
      generate_report: async (parameters: { scope?: 'global' | 'country'; iso3?: string }) => {
        const aid = pushActivity('generate_report', 'Generating PDF report', parameters.iso3 ?? 'Global');
        let scope = parameters.scope ?? 'global';
        let iso3 = parameters.iso3;

        if (!iso3) {
          const currentSelected = globeStateRef.current.selectedCountry;
          const currentComparison = globeStateRef.current.comparisonData;

          if (currentSelected) {
            iso3 = currentSelected;
            scope = 'country';
          } else if (currentComparison) {
            iso3 = currentComparison.sourceIso;
            scope = 'country';
          } else if (lastNavigatedIso3Ref.current) {
            iso3 = lastNavigatedIso3Ref.current;
            scope = 'country';
          } else if (nearestSpotlightIsoRef.current) {
            // Use the nearest country to where the globe camera was last directed
            iso3 = nearestSpotlightIsoRef.current;
            scope = 'country';
          }
        }

        generateReport(scope as 'global' | 'country', iso3)
          .then(() => resolveActivity(aid, 'done', `${scope} report downloading`))
          .catch((err) => {
            resolveActivity(aid, 'error', 'Generation failed');
            console.error('Report generation failed:', err);
          });
        return `Generating a ${scope} PDF report now. It will download automatically in a moment.`;
      },
      set_time_period: (parameters: { year?: number; month?: number }) => {
        const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        // Year is optional. If provided, validate it.
        if (parameters.year != null && (parameters.year < 2022 || parameters.year > 2026)) {
          return 'Year must be between 2022 and 2026.';
        }

        // Month is optional. If provided, validate it.
        if (parameters.month != null && (parameters.month < 1 || parameters.month > 12)) {
          return 'Month must be between 1 and 12.';
        }

        if (parameters.year == null && parameters.month == null) {
          return 'No date parameters provided.';
        }

        const aid = pushActivity('set_time_period', 'Changing time period',
          parameters.month != null
            ? `${MONTH_NAMES[parameters.month - 1]}${parameters.year ? ` ${parameters.year}` : ''}`
            : String(parameters.year)
        );

        setFilters(f => ({
          ...f,
          year: parameters.year ?? f.year,
          month: parameters.month ?? f.month,
        }));

        const label = parameters.month != null
          ? `${MONTH_NAMES[parameters.month - 1]}${parameters.year ? ` ${parameters.year}` : ''}`
          : String(parameters.year);

        resolveActivity(aid, 'done', label);
        return `Changed to ${label}`;
      },
      run_predictive_scan: async () => {
        const aid = pushActivity('run_predictive_scan', 'Running intelligence scan', 'Future anomalies');
        setViewMode('predictive-risks');
        try {
          const data = await getPredictiveRisks();
          setPredictiveRisks(data.risks);

          if (data.risks && data.risks.length > 0) {
            const topRisk = data.risks.reduce((prev, current) =>
              (prev.confidence_score > current.confidence_score) ? prev : current
            );

            resolveActivity(aid, 'done', topRisk.country_name);
            return `I have performed a predictive intelligence scan using the Actian Vector DB. The most significant anomaly identified is in ${topRisk.country_name}, where ${topRisk.risk_title} is projected with a confidence of ${Math.round(topRisk.confidence_score * 100)} percent. ${topRisk.risk_description}`;
          } else {
            resolveActivity(aid, 'done', 'No risks found');
            return "Scan complete. Our predictive models do not currently identify any significant future anomalies.";
          }
        } catch (error) {
          console.error('Predictive scan failed:', error);
          resolveActivity(aid, 'error', 'Analysis failed');
          return "I apologize, but I encountered an error while accessing the predictive models.";
        }
      },
      reset_view: (parameters: {}) => {
        const aid = pushActivity('reset_view', 'Resetting view');
        setViewMode('severity');
        setComparisonData(null);
        setGenieChartData(null);
        setSelectedCountry(null);
        setIsSpotlightActive(false);
        lastNavigatedIso3Ref.current = null;
        setFlyToCoordinates(null);
        resolveActivity(aid, 'done');
        return 'Successfully reset the globe view to default.';
      },
      navigate_to_page: (parameters: any) => {
        const page = typeof parameters === 'string' ? parameters : parameters.page;
        const aid = pushActivity('navigate_to_page', 'Navigating', page);
        const target = page === 'globe' ? '/globe' : '/dashboard';
        router.push(target);
        resolveActivity(aid, 'done');
        return `Successfully navigated to the ${page}.`;
      },
      end_conversation: () => {
        console.log('AI called end_conversation');
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

  const isVoiceActive = hasStarted && status === 'connected';

  useEffect(() => {
    if (isVoiceActive) {
      document.body.classList.add('hide-cursor');
    } else {
      document.body.classList.remove('hide-cursor');
    }
  }, [isVoiceActive]);

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
    isVoiceActive,
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
