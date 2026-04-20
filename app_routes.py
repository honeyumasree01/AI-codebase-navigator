import json
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from db import history as qh
from db import queries
from graph.neo4j_client import Neo4jClient
from orchestrator import normalize_repo_url
from query.engine import run_query
from streams.ingest_status import ingest_progress_events
from utils.auth import require_token
from utils.health import health_payload
from worker.tasks import ingest_repo_task

router = APIRouter()


class ConnectBody(BaseModel):
    github_url: str


class QueryBody(BaseModel):
    query_type: Literal["location", "impact", "explain", "flow", "review", "improve", "fix"]
    question: str | None = None
    symbol: str | None = None
    file_path: str | None = None
    from_symbol: str | None = None
    to_symbol: str | None = None


@router.get("/health")
async def health():
    return await health_payload()


@router.post("/repos")
async def connect_repo(body: ConnectBody, __=Depends(require_token)):
    try:
        url = normalize_repo_url(body.github_url)
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
    existing = await queries.get_complete_repo_by_url(url)
    if existing:
        return {
            "repo_id": str(existing["id"]),
            "already_indexed": True,
        }
    rid = uuid4()
    name = url.rstrip("/").rsplit("/", 1)[-1].removesuffix(".git")
    await queries.insert_repo(rid, url, name, "pending")
    ingest_repo_task.delay(str(rid), url)
    return {"repo_id": str(rid), "already_indexed": False}


@router.get("/repos/{repo_id}/status")
async def repo_status(repo_id: UUID, __=Depends(require_token)):
    return EventSourceResponse(ingest_progress_events(repo_id))


@router.get("/repos/{repo_id}")
async def repo_get(repo_id: UUID, __=Depends(require_token)):
    row = await queries.get_repo(repo_id)
    if not row:
        raise HTTPException(404, detail="repo not found")
    return {
        "status": row.get("status"),
        "file_count": row.get("file_count"),
        "chunk_count": row.get("chunk_count"),
        "name": row.get("name"),
        "github_url": row.get("github_url"),
    }


@router.get("/repos/{repo_id}/history")
async def repo_history(repo_id: UUID, __=Depends(require_token)):
    return await qh.list_query_history(repo_id)


@router.get("/repos/{repo_id}/tree")
async def repo_tree(repo_id: UUID, __=Depends(require_token)):
    row = await queries.get_repo(repo_id)
    if not row:
        raise HTTPException(404, detail="repo not found")
    return {"tree": row.get("file_tree") or {}}


@router.get("/repos/{repo_id}/file")
async def repo_file(
    repo_id: UUID,
    path: str = Query(...),
    __=Depends(require_token),
):
    txt = await queries.get_repo_file(repo_id, path)
    if txt is None:
        raise HTTPException(404, detail="file not found")
    lines = txt.splitlines()
    return {
        "path": path,
        "lines": [{"n": i + 1, "text": line} for i, line in enumerate(lines)],
    }


@router.get("/repos/{repo_id}/imports")
async def repo_imports(
    repo_id: UUID,
    path: str = Query(...),
    __=Depends(require_token),
):
    neo = Neo4jClient()
    try:
        up = await neo.get_dependents(str(repo_id), path)
        down = await neo.get_dependencies(str(repo_id), path)
    finally:
        await neo.close()
    return {"dependents": up, "dependencies": down, "path": path}


@router.post("/repos/{repo_id}/query")
async def repo_query(repo_id: UUID, body: QueryBody, __=Depends(require_token)):
    row = await queries.get_repo(repo_id)
    if not row:
        raise HTTPException(404, detail="repo not found")
    payload = body.model_dump(exclude_none=True)
    qt = payload.pop("query_type")

    async def gen():
        try:
            ans = await run_query(repo_id, str(repo_id), qt, payload)
        except Exception as ex:
            yield {"event": "error", "data": str(ex)}
            return
        if qt in ("review", "improve", "fix"):
            yield {"event": "complete", "data": json.dumps(ans)}
            return
        blob = (
            ans.get("answer")
            or ans.get("explanation")
            or ans.get("summary")
            or json.dumps(ans)
        )
        for w in str(blob).split():
            yield {"event": "token", "data": w + " "}
        yield {"event": "complete", "data": json.dumps(ans)}

    return EventSourceResponse(gen())
