"use client";

/**
 * QueryBar
 *
 * Bottom-center text input for typing natural language queries on the globe page.
 * Sends queries through the Genie API and populates GenieChartData in context.
 */

import { useState, useCallback } from "react";
import { useGlobeContext } from "@/context/GlobeContext";
import { queryGenie } from "@/lib/api";

export default function QueryBar() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setGenieChartData } = useGlobeContext();

  const handleSubmit = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await queryGenie(q);
      setGenieChartData({
        question: q,
        columns: result.columns ?? [],
        rows: result.rows ?? [],
        description: result.description,
        sql: result.sql,
      });
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [input, loading, setGenieChartData]);

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-4">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1117]/90 backdrop-blur-md px-4 py-2 shadow-xl">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Ask about the data..."
          className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/30 outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          className="shrink-0 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#00d4ff]/20 text-[#00d4ff] hover:bg-[#00d4ff]/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? "Querying..." : "Ask"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400/80 text-center">{error}</p>
      )}
    </div>
  );
}
