/**
 * Typed API client for the Crisis Topography backend.
 *
 * All functions fetch from the FastAPI backend and return typed responses.
 * Handles 503 (warehouse starting) with a specific error type so the UI
 * can show a "warming up" state instead of a generic error.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class WarehouseStartingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarehouseStartingError";
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (res.status === 503) {
    throw new WarehouseStartingError(
      "The SQL warehouse is starting up. This may take 30-60 seconds on the free tier."
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// -- Types --

export interface Country {
  location_code: string;
  location_name: string;
  population: number;
}

export interface MismatchEntry {
  location_code: string;
  location_name: string;
  severity: number;
  funding_requested: number;
  funding_received: number;
  coverage_ratio: number;
  mismatch_score: number;
  people_in_need: number;
  funding_per_capita: number;
}

export interface ProjectAnomaly {
  project_name: string;
  location_code: string;
  cluster_name: string;
  budget: number;
  anomaly_score: number;
  is_anomaly: boolean;
}

export interface ClusterBenchmark {
  cluster_name: string;
  project_count: number;
  mean_budget: number;
  median_budget: number;
  std_budget: number;
  min_budget: number;
  max_budget: number;
}

export interface AskResponse {
  answer: string;
  sources: { location_code: string; location_name: string }[];
}

export interface HealthResponse {
  status: string;
  data_loaded: boolean;
  warehouse: {
    warehouse_id: string;
    state: string;
    name: string;
  };
}

// -- API Functions --

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch("/api/health");
}

export async function getCountries(
  year: number = 2024
): Promise<{ year: number; countries: Country[] }> {
  return apiFetch(`/api/countries?year=${year}`);
}

export async function getMismatchData(): Promise<{
  count: number;
  mismatches: MismatchEntry[];
}> {
  return apiFetch("/api/mismatch");
}

export async function getMismatchDetail(
  iso3: string
): Promise<MismatchEntry> {
  return apiFetch(`/api/mismatch/${iso3}`);
}

export async function getProjectAnomalies(
  country?: string
): Promise<{ count: number; anomalies: ProjectAnomaly[] }> {
  const query = country ? `?country=${country}` : "";
  return apiFetch(`/api/projects/anomalies${query}`);
}

export async function getClusterBenchmarks(): Promise<{
  count: number;
  benchmarks: ClusterBenchmark[];
}> {
  return apiFetch("/api/clusters/benchmarks");
}

export async function compareCountries(
  a: string,
  b: string
): Promise<{ country_a: MismatchEntry; country_b: MismatchEntry }> {
  return apiFetch(`/api/compare?a=${a}&b=${b}`);
}

export async function askQuestion(
  question: string
): Promise<AskResponse> {
  return apiFetch("/api/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}
