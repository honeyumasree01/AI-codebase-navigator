import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from utils.config import get_settings

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def db_init() -> None:
    global _engine, _session_factory
    url = get_settings().database_url
    _engine = create_async_engine(url, pool_pre_ping=True)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        db_init()
    assert _session_factory is not None
    return _session_factory


async def insert_repo(
    repo_id: UUID,
    github_url: str,
    name: str | None,
    status: str = "pending",
) -> None:
    sf = session_factory()
    async with sf() as s:
        await s.execute(
            text(
                "INSERT INTO repos (id, github_url, name, status) "
                "VALUES (:id, :url, :name, :status)"
            ),
            {"id": repo_id, "url": github_url, "name": name, "status": status},
        )
        await s.commit()


async def update_repo_status(
    repo_id: UUID,
    status: str,
    error_message: str | None = None,
    file_count: int | None = None,
    chunk_count: int | None = None,
    file_tree: Any | None = None,
) -> None:
    sf = session_factory()
    parts = ["status = :st", "updated_at = :ts"]
    params: dict[str, Any] = {
        "id": repo_id,
        "st": status,
        "ts": datetime.utcnow(),
        "err": error_message,
        "fc": file_count,
        "cc": chunk_count,
        "ft": json.dumps(file_tree) if file_tree is not None else None,
    }
    if error_message is not None:
        parts.append("error_message = :err")
    if file_count is not None:
        parts.append("file_count = :fc")
    if chunk_count is not None:
        parts.append("chunk_count = :cc")
    if file_tree is not None:
        parts.append("file_tree = CAST(:ft AS jsonb)")
    sql = f"UPDATE repos SET {', '.join(parts)} WHERE id = :id"
    async with sf() as s:
        await s.execute(text(sql), params)
        await s.commit()


async def get_repo(repo_id: UUID) -> dict[str, Any] | None:
    sf = session_factory()
    async with sf() as s:
        r = await s.execute(
            text("SELECT * FROM repos WHERE id = :id"), {"id": repo_id}
        )
        row = r.mappings().first()
        return dict(row) if row else None


async def get_complete_repo_by_url(github_url: str) -> dict[str, Any] | None:
    sf = session_factory()
    async with sf() as s:
        r = await s.execute(
            text(
                "SELECT * FROM repos WHERE github_url = :url AND status = 'complete' "
                "ORDER BY updated_at DESC LIMIT 1"
            ),
            {"url": github_url},
        )
        row = r.mappings().first()
        return dict(row) if row else None


async def upsert_repo_file(repo_id: UUID, path: str, content: str) -> None:
    sf = session_factory()
    async with sf() as s:
        await s.execute(
            text(
                "INSERT INTO repo_files (repo_id, path, content) VALUES "
                "(:rid, :path, :c) ON CONFLICT (repo_id, path) DO UPDATE SET content = EXCLUDED.content"
            ),
            {"rid": repo_id, "path": path, "c": content},
        )
        await s.commit()


async def get_repo_file(repo_id: UUID, path: str) -> str | None:
    sf = session_factory()
    async with sf() as s:
        r = await s.execute(
            text(
                "SELECT content FROM repo_files WHERE repo_id = :id AND path = :p"
            ),
            {"id": repo_id, "p": path},
        )
        row = r.first()
        return str(row[0]) if row else None


