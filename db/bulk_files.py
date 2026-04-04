from uuid import UUID

from sqlalchemy import text

from db.queries import session_factory


async def bulk_save_files(repo_id: UUID, rows: list[tuple[str, str]]) -> None:
    if not rows:
        return
    sf = session_factory()
    async with sf() as s:
        for path, content in rows:
            await s.execute(
                text(
                    "INSERT INTO repo_files (repo_id, path, content) VALUES "
                    "(:rid, :path, :c) ON CONFLICT (repo_id, path) DO UPDATE SET content = EXCLUDED.content"
                ),
                {"rid": repo_id, "path": path, "c": content},
            )
        await s.commit()
