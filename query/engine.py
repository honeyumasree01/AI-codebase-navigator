import asyncio
import json
from typing import Any
from uuid import UUID, uuid4

from graph.neo4j_client import Neo4jClient
from utils.embeddings import embed_text
from utils.llm import invoke_claude
from utils.pinecone_store import query_ns


def _looks_like_file_path(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    if s.endswith(".py"):
        return True
    return "/" in s or "\\" in s


def _pack_hits(hits: list[dict[str, Any]]) -> str:
    lines = []
    for h in hits:
        md = h.get("metadata") or {}
        lines.append(json.dumps({"id": h.get("id"), "meta": md}, default=str))
    return "\n".join(lines)


async def _ask(system: str, user: str) -> dict[str, Any]:
    return await asyncio.to_thread(
        invoke_claude,
        [{"role": "user", "content": user}],
        system=system,
    )


class QueryEngine:
    def __init__(self, repo_id: str) -> None:
        self.repo_id = repo_id
        self.neo = Neo4jClient()

    async def close(self) -> None:
        await self.neo.close()

    async def find_location(self, question: str) -> dict[str, Any]:
        v = await asyncio.to_thread(embed_text, question)
        hits = await asyncio.to_thread(query_ns, self.repo_id, v, 10, None)
        sys = 'JSON only: {"answer":"string","references":[{"file":"string","line":int,"snippet":"string"}]}'
        payload = f"Question:\n{question}\n\nChunks:\n{_pack_hits(hits)}"
        return await _ask(sys, payload)

    async def find_impact(self, symbol: str) -> dict[str, Any]:
        raw = symbol.strip()
        if not raw:
            return {"impacted_files": [], "severity": "low", "explanation": "symbol not found"}

        # File path: "who imports this module?" (import-graph dependents)
        if _looks_like_file_path(raw):
            path = raw.replace("\\", "/")
            deps = await self.neo.get_dependents(self.repo_id, path)
            deps = list(dict.fromkeys(deps))
            if not deps:
                return {
                    "impacted_files": [],
                    "severity": "low",
                    "explanation": "file not found in graph or no importing files",
                }
            hits: list[dict[str, Any]] = []
            v = await asyncio.to_thread(embed_text, f"impact of changing file {path}")
            hits = await asyncio.to_thread(query_ns, self.repo_id, v, 8, None)
            hits = [h for h in hits if (h.get("metadata") or {}).get("file_path") in deps][:8]
            sys = 'JSON only: {"impacted_files":["string"],"severity":"high|medium|low","explanation":"string"}'
            body = f"File (import dependents): {path}\nDependent files: {deps}\nChunks:\n{_pack_hits(hits)}"
            return await _ask(sys, body)

        nid, path = await self.neo.resolve_function_file(self.repo_id, raw)
        if not nid or not path:
            return {"impacted_files": [], "severity": "low", "explanation": "symbol not found"}
        imp = await self.neo.get_impact(self.repo_id, nid)
        deps = list({r["path"] for r in imp})
        hits: list[dict[str, Any]] = []
        if deps:
            v = await asyncio.to_thread(embed_text, f"impact of changing {raw} in {path}")
            hits = await asyncio.to_thread(query_ns, self.repo_id, v, 8, None)
            hits = [h for h in hits if (h.get("metadata") or {}).get("file_path") in deps][:8]
        sys = 'JSON only: {"impacted_files":["string"],"severity":"high|medium|low","explanation":"string"}'
        body = f"Symbol: {raw}\nFile: {path}\nDependent files: {deps}\nChunks:\n{_pack_hits(hits)}"
        return await _ask(sys, body)

    async def explain_file(self, file_path: str) -> dict[str, Any]:
        flt = {"file_path": file_path}
        v = await asyncio.to_thread(embed_text, f"explain file {file_path}")
        hits = await asyncio.to_thread(query_ns, self.repo_id, v, 24, flt)
        if len(hits) < 4:
            hits = await asyncio.to_thread(query_ns, self.repo_id, v, 24, None)
            hits = [h for h in hits if (h.get("metadata") or {}).get("file_path") == file_path][:24]
        up = await self.neo.get_dependents(self.repo_id, file_path)
        down = await self.neo.get_dependencies(self.repo_id, file_path)
        sys = (
            'JSON only: {"summary":"string","purpose":"string","key_functions":["string"],'
            '"dependencies":["string"],"dependents":["string"]}'
        )
        payload = (
            f"File: {file_path}\nImports from graph: {down}\nDependents: {up}\n"
            f"Chunks:\n{_pack_hits(hits)}"
        )
        return await _ask(sys, payload)

    async def trace_flow(self, from_symbol: str, to_symbol: str) -> dict[str, Any]:
        fa, _ = await self.neo.resolve_function_file(self.repo_id, from_symbol)
        fb, _ = await self.neo.resolve_function_file(self.repo_id, to_symbol)
        if not fa or not fb:
            return {
                "path": [],
                "path_type": "import_reachability",
                "explanation": "one or both symbols missing",
                "data_transformations": [],
            }
        chain = await self.neo.get_connection_path(self.repo_id, fa, fb)
        paths = [c["file"] for c in chain]
        hits: list[dict[str, Any]] = []
        if paths:
            v = await asyncio.to_thread(embed_text, " ".join(paths))
            hits = await asyncio.to_thread(query_ns, self.repo_id, v, 10, None)
        sys = (
            'JSON only: {"path":[{"file":"string","role":"string"}],"path_type":"import_reachability",'
            '"explanation":"string","data_transformations":["string"]}'
        )
        payload = f"From {from_symbol} to {to_symbol}\nImport path files: {paths}\n{_pack_hits(hits)}"
        out = await _ask(sys, payload)
        out.setdefault("path_type", "import_reachability")
        return out


async def run_query(
    repo_uuid: UUID,
    repo_id: str,
    qtype: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from db import history as qh

    eng = QueryEngine(repo_id)
    try:
        if qtype == "location":
            ans = await eng.find_location(payload.get("question", ""))
        elif qtype == "impact":
            sym = (payload.get("symbol") or payload.get("question") or "").strip()
            ans = await eng.find_impact(sym)
        elif qtype == "explain":
            fp = (payload.get("file_path") or payload.get("question") or "").strip()
            ans = await eng.explain_file(fp)
        elif qtype == "flow":
            ans = await eng.trace_flow(
                payload.get("from_symbol", ""),
                payload.get("to_symbol", ""),
            )
        else:
            ans = {"error": "unknown query_type"}
        await qh.insert_query_history(uuid4(), repo_uuid, qtype, json.dumps(payload), ans)
        return ans
    finally:
        await eng.close()
