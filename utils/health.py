import asyncio
from typing import Any

import redis.asyncio as aioredis
from neo4j import AsyncGraphDatabase
from neo4j.exceptions import ConfigurationError, Neo4jError
from pinecone import Pinecone
from sqlalchemy import text

from db.queries import session_factory
from utils.config import get_settings


async def check_postgres() -> str:
    try:
        sf = session_factory()
        async with sf() as s:
            await s.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "error"


async def check_redis() -> str:
    s = get_settings()
    url = (s.redis_url or "").strip()
    if not url:
        return "not_configured"
    r = aioredis.from_url(url, decode_responses=True)
    try:
        if await r.ping():
            return "ok"
        return "error"
    except Exception:
        return "error"
    finally:
        await r.aclose()


async def check_neo4j() -> str:
    s = get_settings()
    uri = (s.neo4j_uri or "").strip()
    if not uri:
        return "not_configured"
    d = None
    try:
        try:
            d = AsyncGraphDatabase.driver(uri, auth=(s.neo4j_user, s.neo4j_password))
        except (ConfigurationError, ValueError):
            return "invalid_uri"
        async with d.session() as sess:
            await sess.run("RETURN 1")
        return "ok"
    except Neo4jError:
        return "error"
    except Exception:
        return "error"
    finally:
        if d is not None:
            await d.close()


def _check_pinecone_sync() -> None:
    s = get_settings()
    pc = Pinecone(api_key=s.pinecone_api_key)
    pc.describe_index(s.pinecone_index)


async def check_pinecone() -> str:
    s = get_settings()
    if not (s.pinecone_api_key or "").strip() or not (s.pinecone_index or "").strip():
        return "not_configured"
    try:
        await asyncio.to_thread(_check_pinecone_sync)
        return "ok"
    except Exception:
        return "error"


async def health_payload() -> dict[str, Any]:
    pg, rd, neo, pc = await asyncio.gather(
        check_postgres(),
        check_redis(),
        check_neo4j(),
        check_pinecone(),
    )
    all_ok = pg == "ok" and rd == "ok" and neo == "ok" and pc == "ok"
    return {
        "status": "ok" if all_ok else "degraded",
        "postgres": pg,
        "redis": rd,
        "neo4j": neo,
        "pinecone": pc,
    }
