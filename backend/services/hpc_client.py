import httpx

HPC_BASE = "https://api.hpc.tools/v1/public"

async def fetch_plans_by_year(year: int) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{HPC_BASE}/plan/year/{year}")
        resp.raise_for_status()
        return resp.json()

async def fetch_funding_flows(year: int, group_by: str = "Country") -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HPC_BASE}/fts/flow",
            params={"year": year, "groupby": group_by}
        )
        resp.raise_for_status()
        return resp.json()

async def fetch_projects_for_plan(plan_id: int) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{HPC_BASE}/project/plan/{plan_id}")
        resp.raise_for_status()
        return resp.json()

async def fetch_funding_by_country(country_iso3: str, year: int) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HPC_BASE}/fts/flow",
            params={"countryISO3": country_iso3, "year": year}
        )
        resp.raise_for_status()
        return resp.json()