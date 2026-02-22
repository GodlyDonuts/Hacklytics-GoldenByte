"""Benchmark API — vector search for similar projects and B2B comparison."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.databricks_client import vector_search

logger = logging.getLogger(__name__)
router = APIRouter()


class BenchmarkRequest(BaseModel):
    project_code: str
    num_neighbors: int = 5


@router.post("/benchmark")
async def benchmark_project(req: BenchmarkRequest):
    """Find nearest neighbors in embedding space and compare B2B ratios.

    1. Look up query project in project_embeddings
    2. Vector search with project text_blob to find similar projects
    3. Return neighbors with B2B deltas and insight
    """
    project_code = (req.project_code or "").strip()
    if not project_code:
        raise HTTPException(400, "project_code is required")
    num_neighbors = max(1, min(20, req.num_neighbors))

    try:
        # 1. Directly vector search for similar projects based on user input
        neighbors_raw = await vector_search(
            query_text=project_code,
            num_results=num_neighbors + 1,  # get one extra because the first is considered the query target
            columns=[
                "project_id",
                "project_code",
                "project_name",
                "iso3",
                "country_name",
                "cluster",
                "b2b_ratio",
                "cost_per_beneficiary",
            ],
        )
    except Exception as e:
        logger.warning("Vector search failed: %s", e)
        raise HTTPException(502, f"Vector search error: {e}")

    if not neighbors_raw:
        raise HTTPException(404, f"No similar projects found for: {project_code}")

    # Set the top result as the query_project
    query_row = neighbors_raw[0]
    query_b2b = _float(query_row.get("b2b_ratio"))

    # The rest are neighbors
    neighbors = []
    for n in neighbors_raw[1:]:
        b2b = _float(n.get("b2b_ratio"))
        delta = (b2b - query_b2b) if (b2b is not None and query_b2b is not None) else None
        neighbors.append({
            "project_code": n.get("project_code"),
            "project_name": n.get("project_name"),
            "iso3": n.get("iso3"),
            "country_name": n.get("country_name"),
            "cluster": n.get("cluster"),
            "b2b_ratio": b2b,
            "cost_per_beneficiary": _float(n.get("cost_per_beneficiary")),
            "b2b_delta": delta,
            "similarity_score": _float(n.get("similarity_score")) or _float(n.get("score")),
        })
        if len(neighbors) >= num_neighbors:
            break

    # 3. Build insight
    insight = _build_insight(query_row, neighbors, query_b2b)

    return {
        "query_project": {
            "project_code": query_row.get("project_code"),
            "project_name": query_row.get("project_name"),
            "cluster": query_row.get("cluster"),
            "b2b_ratio": query_b2b,
            "cost_per_beneficiary": _float(query_row.get("cost_per_beneficiary")),
        },
        "neighbors": neighbors,
        "insight": insight,
    }


def _escape_sql_str(s: str) -> str:
    """Escape single quotes for SQL string literal."""
    return s.replace("'", "''")


def _float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _build_insight(query_row: dict, neighbors: list, query_b2b: float | None) -> str:
    """Generate a short insight comparing query project to neighbors."""
    if not neighbors or query_b2b is None:
        return "No comparable projects found for benchmarking."

    better = [n for n in neighbors if n.get("b2b_delta") and n["b2b_delta"] > 0]
    worse = [n for n in neighbors if n.get("b2b_delta") and n["b2b_delta"] < 0]

    if better and worse:
        best = max(better, key=lambda x: x["b2b_delta"] or 0)
        pct = ((best["b2b_delta"] or 0) / query_b2b * 100) if query_b2b else 0
        return (
            f"This project serves {abs(pct):.0f}% fewer beneficiaries per dollar "
            f"compared to similar {query_row.get('cluster', '')} projects "
            f"(e.g. {best.get('project_code', '')} in {best.get('iso3', '')})."
        )
    if better:
        best = max(better, key=lambda x: x["b2b_delta"] or 0)
        return (
            f"Similar projects like {best.get('project_code', '')} in {best.get('iso3', '')} "
            f"achieve higher beneficiary-to-budget ratios."
        )
    return "This project's B2B ratio is comparable to similar projects in the dataset."
