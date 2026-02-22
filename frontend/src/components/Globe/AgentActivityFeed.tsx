"use client";

/**
 * AgentActivityFeed
 *
 * Renders a vertical stack of small pill notifications showing what the
 * ElevenLabs voice agent is doing: which tools it called, whether calls
 * are in-flight or finished, and brief result summaries. Pills auto-dismiss
 * after a few seconds.
 */

import { useEffect, useState, useCallback, useRef } from "react";

export interface Activity {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "done" | "error";
  timestamp: number;
}

const DISMISS_MS = 4000;

const TOOL_ICONS: Record<string, string> = {
  query_data: "DB",
  show_location_on_globe: "FLY",
  change_view_mode: "VIEW",
  compare_countries: "CMP",
  generate_report: "PDF",
  reset_view: "RST",
};

const TOOL_COLORS: Record<string, string> = {
  query_data: "#00d4ff",
  show_location_on_globe: "#00e5a0",
  change_view_mode: "#a855f7",
  compare_countries: "#f59e0b",
  generate_report: "#ec4899",
  reset_view: "#6b7280",
};

/** Singleton activity manager so VoiceChatContext can push without React context coupling */
type Listener = (activities: Activity[]) => void;
const listeners = new Set<Listener>();
let activityList: Activity[] = [];

function notify() {
  for (const fn of listeners) fn([...activityList]);
}

export function pushActivity(
  toolName: string,
  label: string,
  detail?: string
): string {
  const id = `${toolName}-${Date.now()}`;
  activityList = [
    ...activityList,
    { id, label, detail, status: "pending", timestamp: Date.now() },
  ];
  notify();
  return id;
}

export function resolveActivity(
  id: string,
  status: "done" | "error",
  detail?: string
) {
  activityList = activityList.map((a) =>
    a.id === id ? { ...a, status, detail: detail ?? a.detail } : a
  );
  notify();
}

export default function AgentActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler: Listener = (list) => setActivities(list);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback((id: string) => {
    activityList = activityList.filter((a) => a.id !== id);
    notify();
  }, []);

  // Auto-dismiss completed activities
  useEffect(() => {
    for (const a of activities) {
      if (a.status !== "pending" && !timersRef.current.has(a.id)) {
        const timer = setTimeout(() => {
          timersRef.current.delete(a.id);
          dismiss(a.id);
        }, DISMISS_MS);
        timersRef.current.set(a.id, timer);
      }
    }
  }, [activities, dismiss]);

  if (activities.length === 0) return null;

  return (
    <div className="absolute top-16 right-4 z-40 flex flex-col gap-2 pointer-events-none max-w-[280px]">
      {activities.map((a) => {
        const toolBase = a.id.split("-")[0];
        const color = TOOL_COLORS[toolBase] ?? "#00d4ff";
        const icon = TOOL_ICONS[toolBase] ?? "AI";

        return (
          <div
            key={a.id}
            className="pointer-events-auto flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-[#0a0e14]/90 backdrop-blur-md shadow-lg animate-in slide-in-from-right-2 duration-300"
            style={{ borderColor: `${color}20` }}
          >
            {/* Icon badge */}
            <div
              className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold tracking-wide"
              style={{
                backgroundColor: `${color}15`,
                color,
              }}
            >
              {icon}
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/80 font-medium truncate">
                {a.label}
              </p>
              {a.detail && (
                <p className="text-xs text-white/40 truncate">{a.detail}</p>
              )}
            </div>

            {/* Status indicator */}
            <div className="shrink-0">
              {a.status === "pending" ? (
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: color }}
                />
              ) : a.status === "done" ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.5L5 9L9.5 3.5"
                    stroke="#00e5a0"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 3l6 6M9 3l-6 6"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
