"""Genie API -- natural language to SQL via Databricks Genie Spaces.

Proxies NL questions to the Databricks Genie API, handling the
start-conversation -> poll -> fetch-result workflow server-side
so the frontend makes a single POST.
"""

import asyncio
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class GenieRequest(BaseModel):
    question: str


class GenieColumn(BaseModel):
    name: str
    type: str


class GenieResponse(BaseModel):
    question: str
    sql: str | None = None
    columns: list[GenieColumn] = []
    rows: list[list[str | int | float | None]] = []
    description: str | None = None
    conversation_id: str | None = None
    message_id: str | None = None


def _genie_headers() -> dict[str, str]:
    token = os.getenv("DATABRICKS_TOKEN")
    if not token:
        raise ValueError("DATABRICKS_TOKEN is required")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _genie_base_url() -> str:
    host = os.getenv("DATABRICKS_HOST", "").rstrip("/")
    space_id = os.getenv("GENIE_SPACE_ID")
    if not host or not space_id:
        raise ValueError("DATABRICKS_HOST and GENIE_SPACE_ID are required")
    return f"{host}/api/2.0/genie/spaces/{space_id}"


async def _start_conversation(
    client: httpx.AsyncClient, question: str
) -> tuple[str, str]:
    """Start a Genie conversation. Returns (conversation_id, message_id)."""
    url = f"{_genie_base_url()}/start-conversation"
    resp = await client.post(url, headers=_genie_headers(), json={"content": question})
    resp.raise_for_status()
    data = resp.json()
    conv_id = data.get("conversation_id") or data.get("id")
    msg_id = data.get("message_id")
    if not msg_id:
        messages = data.get("messages", [])
        if messages:
            msg_id = messages[-1].get("id")
    if not conv_id or not msg_id:
        raise RuntimeError(f"Unexpected Genie response structure: {list(data.keys())}")
    return conv_id, msg_id


async def _poll_message(
    client: httpx.AsyncClient,
    conversation_id: str,
    message_id: str,
    interval: float = 1.5,
    timeout: float = 30.0,
) -> dict:
    """Poll until message reaches COMPLETED with attachments."""
    url = f"{_genie_base_url()}/conversations/{conversation_id}/messages/{message_id}"
    elapsed = 0.0
    while elapsed < timeout:
        resp = await client.get(url, headers=_genie_headers())
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "")
        if status == "COMPLETED" and data.get("attachments"):
            return data
        if status in ("FAILED", "CANCELLED"):
            error_msg = data.get("error", "Genie query failed")
            raise RuntimeError(str(error_msg))
        await asyncio.sleep(interval)
        elapsed += interval
    raise TimeoutError(f"Genie message did not complete within {timeout}s")


async def _get_query_result(
    client: httpx.AsyncClient,
    conversation_id: str,
    message_id: str,
    attachment_id: str,
) -> dict:
    """Fetch the SQL query result for a completed attachment."""
    url = (
        f"{_genie_base_url()}/conversations/{conversation_id}"
        f"/messages/{message_id}/query-result/{attachment_id}"
    )
    resp = await client.get(url, headers=_genie_headers())
    resp.raise_for_status()
    return resp.json()


@router.post("/genie")
async def query_genie(req: GenieRequest) -> GenieResponse:
    """Execute a natural language question against the Genie Space."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            conv_id, msg_id = await _start_conversation(client, req.question)
            message = await _poll_message(client, conv_id, msg_id)

            # Extract SQL and description from attachments
            attachments = message.get("attachments", [])
            sql = None
            description = None
            attachment_id = None

            for att in attachments:
                if "query" in att:
                    attachment_id = att.get("attachment_id")
                    query_info = att["query"]
                    sql = query_info.get("query")
                    description = query_info.get("description")
                    break

            # Also check for text description in attachments
            if not description:
                for att in attachments:
                    if "text" in att:
                        description = att["text"].get("content")
                        break

            columns: list[GenieColumn] = []
            rows: list[list] = []

            if attachment_id:
                result = await _get_query_result(client, conv_id, msg_id, attachment_id)
                # Parse columns from statement response
                stmt_resp = result.get("statement_response", result)
                manifest = stmt_resp.get("manifest", {})
                schema_cols = manifest.get("schema", {}).get("columns", [])
                columns = [
                    GenieColumn(
                        name=c.get("name", ""),
                        type=c.get("type_name", c.get("type_text", "STRING")),
                    )
                    for c in schema_cols
                ]
                # Parse row data
                data_array = stmt_resp.get("result", {}).get("data_array", [])
                rows = data_array

            return GenieResponse(
                question=req.question,
                sql=sql,
                columns=columns,
                rows=rows,
                description=description,
                conversation_id=conv_id,
                message_id=msg_id,
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
