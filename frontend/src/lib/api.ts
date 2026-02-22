/**
 * Typed API client for the Crisis Topography backend.
 *
 * All functions fetch from the FastAPI backend and return typed responses.
 * Handles 503 (warehouse starting) with a specific error type so the UI
 * can show a "warming up" state instead of a generic error.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
    const text = await res.text();
    let message = `API error: ${res.status}`;
    try {
      const body = text ? JSON.parse(text) : {};
      const detail = body.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        const loc = first.loc ? first.loc.join(".") : "";
        const msg = first.msg ?? "";
        message = loc ? `${loc}: ${msg}` : msg;
      } else if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        message = String(detail);
      }
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
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

export interface Crisis {
  crisis_id: string;
  crisis_name: string;
  acaps_severity: number;
  severity_class: string;
  has_hrp: boolean;
  appeal_type: string;
  funding_state: string;
  people_in_need: number;
  target_beneficiaries: number;
  funding_usd: number;
  requirements_usd: number;
  funding_gap_usd: number;
  funding_coverage_pct: number;
  coverage_ratio: number;
  oversight_score: number;
  b2b_ratio: number;
  crisis_rank: number;
}

export interface GlobeCountry {
  iso3: string;
  country_name: string;
  lat: number;
  lng: number;
  crises: Crisis[];
}

export interface GlobeCrisesResponse {
  year: number;
  month: number | null;
  year_month: string;
  countries: GlobeCountry[];
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

// -- Genie (Natural Language to SQL) --

export interface GenieColumn {
  name: string;
  type: string;
}

export interface GenieResponse {
  question: string;
  sql: string | null;
  columns: GenieColumn[];
  rows: (string | number | null)[][];
  description: string | null;
  conversation_id: string | null;
  message_id: string | null;
}

export async function queryGenie(
  question: string
): Promise<GenieResponse> {
  return apiFetch("/api/genie", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

// -- Globe endpoint functions --

export async function getGlobeCrises(
  year: number = 2024,
  month?: number | null
): Promise<GlobeCrisesResponse> {
  const params = new URLSearchParams({ year: String(year) });
  if (month != null) params.set("month", String(month));
  return apiFetch(`/api/globe/crises?${params}`);
}

export interface B2BProject {
  project_code: string | null;
  project_name: string | null;
  cluster: string | null;
  requested_funds: number | null;
  target_beneficiaries: number | null;
  b2b_ratio: number | null;
  cost_per_beneficiary: number | null;
  b2b_percentile: number | null;
  is_outlier: boolean;
  cluster_median_b2b: number | null;
  anomaly_score: number | null;
}

export interface GlobeB2BResponse {
  iso3: string;
  year: number;
  projects: B2BProject[];
  summary: {
    weighted_b2b: number | null;
    median_b2b: number | null;
    total_projects: number;
    outlier_count: number;
  };
}

export async function getGlobeB2B(
  iso3: string,
  year: number = 2024
): Promise<GlobeB2BResponse> {
  return apiFetch(`/api/globe/b2b?iso3=${iso3}&year=${year}`);
}

// -- Benchmark (project-level B2B comparison) --

export interface BenchmarkNeighbor {
  project_code: string | null;
  project_name: string | null;
  iso3: string | null;
  country_name: string | null;
  cluster: string | null;
  b2b_ratio: number | null;
  cost_per_beneficiary: number | null;
  b2b_delta: number | null;
  similarity_score: number | null;
}

export interface BenchmarkResponse {
  query_project: {
    project_code: string | null;
    project_name: string | null;
    cluster: string | null;
    b2b_ratio: number | null;
    cost_per_beneficiary: number | null;
  };
  neighbors: BenchmarkNeighbor[];
  insight: string;
}

export async function benchmarkProject(
  projectCode: string,
  numNeighbors: number = 5
): Promise<BenchmarkResponse> {
  return apiFetch("/api/benchmark", {
    method: "POST",
    body: JSON.stringify({
      project_code: projectCode,
      num_neighbors: numNeighbors,
    }),
  });
}

/**
 * Triggers a PDF report download from the backend.
 * scope: "global" | "country"
 * iso3: required when scope === "country"
 */
export async function generateReport(
  scope: "global" | "country" = "global",
  iso3?: string
): Promise<void> {
  const params = new URLSearchParams({ scope });
  if (iso3) params.set("iso3", iso3);

  const res = await fetch(`${API_BASE}/report?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Report generation failed: ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = scope === "country" && iso3
    ? `Report_${iso3}.pdf`
    : "Report_Global.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

// -- Predictive Risks --

export interface PredictiveRisk {
  iso3: string;
  country_name: string;
  risk_level: "High" | "Critical" | "Moderate" | string;
  risk_title: string;
  risk_description: string;
  confidence_score: number;
  factors: string[];
}

export interface PredictiveResponse {
  risks: PredictiveRisk[];
}

export async function getPredictiveRisks(): Promise<PredictiveResponse> {
  return apiFetch("/api/predictive/risks");
}

