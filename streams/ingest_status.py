import json
from uuid import UUID

import redis.asyncio as aioredis

from utils.config import get_settings


async def ingest_progress_events(repo_id: UUID):
    r = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    ps = r.pubsub()
    await ps.subscribe(f"ingest:{repo_id}")
    try:
        async for msg in ps.listen():
            if msg.get("type") != "message":
                continue
            data = msg.get("data")
            if data is not None:
                yield {"event": "progress", "data": data}
                if isinstance(data, str):
                    try:
                        if json.loads(data).get("stage") == "done":
                            break
                    except json.JSONDecodeError:
                        pass
    finally:
        await ps.unsubscribe(f"ingest:{repo_id}")
        await ps.aclose()
        await r.aclose()
