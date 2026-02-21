import httpx
import base64

HDX_BASE = "https://hapi.humdata.org/api/v2"
APP_ID = base64.b64encode(b"Haxlytics:team@mail.com").decode()

async def fetch_humanitarian_needs(
    location_code: str | None = None,
    year: int | None = None,
    limit: int = 1000,
    offset: int = 0
) -> dict:
    params = {
        "app_identifier": APP_ID,
        "limit": limit,
        "offset": offset,
    }
    if location_code:
        params["location_code"] = location_code
    if year:
        params["reference_period_start"] = f"{year}-01-01"
        params["reference_period_end"] = f"{year}-12-31"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HDX_BASE}/affected-people/humanitarian-needs",
            params=params
        )
        resp.raise_for_status()
        return resp.json()

async def fetch_population(location_code: str | None = None) -> dict:
    params = {"app_identifier": APP_ID, "limit": 1000}
    if location_code:
        params["location_code"] = location_code
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{HDX_BASE}/geography-infrastructure/baseline-population",
            params=params
        )
        resp.raise_for_status()
        return resp.json()