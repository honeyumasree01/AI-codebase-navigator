from typing import Any

from neo4j import AsyncGraphDatabase

from utils.config import get_settings


class Neo4jClient:
    def __init__(self) -> None:
        s = get_settings()
        self._driver = AsyncGraphDatabase.driver(
            s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password)
        )

    async def close(self) -> None:
        await self._driver.close()

    async def clear_repo(self, repo_id: str) -> None:
        q = (
            "MATCH (n) WHERE n.repo_id = $rid DETACH DELETE n"
        )
        async with self._driver.session() as sess:
            await sess.run(q, {"rid": repo_id})

    async def store_import(self, repo_id: str, src: str, dst: str) -> None:
        q = (
            "MERGE (a:File {repo_id:$r, path:$s}) "
            "MERGE (b:File {repo_id:$r, path:$d}) "
            "MERGE (a)-[:IMPORTS]->(b)"
        )
        async with self._driver.session() as sess:
            await sess.run(q, {"r": repo_id, "s": src, "d": dst})

    async def store_function(
        self,
        repo_id: str,
        file_path: str,
        name: str,
        start_line: int,
        end_line: int,
    ) -> None:
        nid = f"{repo_id}:{file_path}:{name}:{start_line}"
        q = (
            "MERGE (f:File {repo_id:$r, path:$p}) "
            "MERGE (fn:Function {node_id:$n}) "
            "SET fn.name=$name, fn.start_line=$sl, fn.end_line=$el, fn.repo_id=$r, fn.path=$p "
            "MERGE (f)-[:CONTAINS]->(fn)"
        )
        async with self._driver.session() as sess:
            await sess.run(
                q,
                {
                    "r": repo_id,
                    "p": file_path,
                    "n": nid,
                    "name": name,
                    "sl": start_line,
                    "el": end_line,
                },
            )

    async def ensure_file(self, repo_id: str, path: str) -> None:
        q = "MERGE (:File {repo_id:$r, path:$p})"
        async with self._driver.session() as sess:
            await sess.run(q, {"r": repo_id, "p": path})

    async def get_dependents(self, repo_id: str, file_path: str) -> list[str]:
        q = (
            "MATCH (d:File {repo_id:$r})-[:IMPORTS*1..10]->(t:File {repo_id:$r, path:$p}) "
            "RETURN DISTINCT d.path AS path"
        )
        async with self._driver.session() as sess:
            r = await sess.run(q, {"r": repo_id, "p": file_path})
            return [rec["path"] async for rec in r]

    async def get_dependencies(self, repo_id: str, file_path: str) -> list[str]:
        q = (
            "MATCH (s:File {repo_id:$r, path:$p})-[:IMPORTS*1..10]->(o:File {repo_id:$r}) "
            "RETURN DISTINCT o.path AS path"
        )
        async with self._driver.session() as sess:
            r = await sess.run(q, {"r": repo_id, "p": file_path})
            return [rec["path"] async for rec in r]

    async def get_impact(self, repo_id: str, node_id: str) -> list[dict[str, Any]]:
        q = (
            "MATCH (fn:Function {node_id:$n})<-[:CONTAINS]-(t:File {repo_id:$r}) "
            "MATCH (d:File {repo_id:$r})-[:IMPORTS*1..5]->(t) "
            "RETURN DISTINCT d.path AS path, t.path AS target"
        )
        async with self._driver.session() as sess:
            r = await sess.run(q, {"r": repo_id, "n": node_id})
            return [dict(rec) async for rec in r]

    async def get_connection_path(
        self, repo_id: str, a_id: str, b_id: str
    ) -> list[dict[str, Any]]:
        cy = (
            "MATCH (fa:Function {node_id:$na})<-[:CONTAINS]-(ffa:File {repo_id:$r}) "
            "MATCH (fb:Function {node_id:$nb})<-[:CONTAINS]-(ffb:File {repo_id:$r}) "
            "MATCH p = shortestPath((ffa)-[:IMPORTS*1..20]->(ffb)) "
            "RETURN [n IN nodes(p) | n.path] AS paths"
        )
        async with self._driver.session() as sess:
            res = await sess.run(
                cy, {"r": repo_id, "na": a_id, "nb": b_id}
            )
            rec = await res.single()
            if not rec or not rec.get("paths"):
                return []
            return [{"file": p} for p in rec["paths"]]

    async def resolve_function_file(
        self, repo_id: str, symbol: str
    ) -> tuple[str | None, str | None]:
        q = (
            "MATCH (fn:Function {repo_id:$r}) WHERE fn.name = $sym "
            "RETURN fn.node_id AS id, fn.path AS path LIMIT 1"
        )
        async with self._driver.session() as sess:
            r = await sess.run(q, {"r": repo_id, "sym": symbol})
            row = await r.single()
            if not row:
                return None, None
            return row.get("id"), row.get("path")
