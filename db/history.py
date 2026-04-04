import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from db.queries import session_factory


async def insert_query_history(
    qid: UUID,
    repo_id: UUID,
    query_type: str,
    question: str,
    answer: dict[str, Any],
) -> None:
    sf = session_factory()
    async with sf() as s:
        await s.execute(
            text(
                "INSERT INTO query_history (id, repo_id, query_type, question, answer) "
                "VALUES (:id, :rid, :qt, :q, CAST(:a AS jsonb))"
            ),
            {
                "id": qid,
                "rid": repo_id,
                "qt": query_type,
                "q": question,
                "a": json.dumps(answer),
            },
        )
        await s.commit()


async def list_query_history(repo_id: UUID, limit: int = 20) -> list[dict[str, Any]]:
    sf = session_factory()
    async with sf() as s:
        r = await s.execute(
            text(
                "SELECT id, query_type, question, answer, created_at "
                "FROM query_history WHERE repo_id = :id ORDER BY created_at DESC LIMIT :lim"
            ),
            {"id": repo_id, "lim": limit},
        )
        return [dict(x) for x in r.mappings().all()]
