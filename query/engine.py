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


async def _file_chunks_or_error(repo_id: str, file_path: str, *, top_k: int = 24) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    fp = (file_path or "").strip()
    if not fp:
        return [], {"error": "File not found in index. Try re-indexing the repo."}
    try:
        flt = {"file_path": fp}
        v = await asyncio.to_thread(embed_text, f"review file {fp}")
        hits = await asyncio.to_thread(query_ns, repo_id, v, top_k, flt)
        if not hits:
            hits = await asyncio.to_thread(query_ns, repo_id, v, top_k, None)
            hits = [h for h in hits if (h.get("metadata") or {}).get("file_path") == fp][:top_k]
        if not hits:
            return [], {"error": "File not found in index. Try re-indexing the repo."}
        return hits, None
    except Exception:
        return [], {"error": "File not found in index. Try re-indexing the repo."}


class QueryEngine:
    def __init__(self, repo_id: str) -> None:
        self.repo_id = repo_id
        self.neo = Neo4jClient()

    async def close(self) -> None:
        await self.neo.close()

    async def _get_full_file(self, file_path: str) -> str:
        """
        Fetch complete file content for high-accuracy review/improve/fix flows.
        Tries DB (`repo_files`) first, then falls back to Pinecone chunk reassembly.
        """
        fp = (file_path or "").strip()
        if not fp:
            return ""

        # Primary source: full file content persisted in Postgres.
        try:
            from db import queries as db_queries

            db_file = await db_queries.get_repo_file(UUID(self.repo_id), fp)
            if db_file:
                return db_file
        except Exception:
            pass

        # Fallback: rebuild from Pinecone chunks for this file.
        try:
            v = await asyncio.to_thread(embed_text, f"file content {fp}")
            hits = await asyncio.to_thread(query_ns, self.repo_id, v, 100, {"file_path": fp})
            if not hits:
                hits = await asyncio.to_thread(query_ns, self.repo_id, v, 100, None)
                hits = [h for h in hits if (h.get("metadata") or {}).get("file_path") == fp][:100]
            if not hits:
                return ""

            hits.sort(key=lambda h: (h.get("metadata") or {}).get("start_line", 0))
            ordered_parts: list[str] = []
            for h in hits:
                md = h.get("metadata") or {}
                text = (md.get("text") or h.get("text") or "").strip()
                if text:
                    ordered_parts.append(text)
            return "\n".join(ordered_parts)
        except Exception:
            return ""

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

    async def review_file(self, file_path: str) -> dict[str, Any]:
        full_content = await self._get_full_file(file_path)
        if not full_content:
            return {"error": "File not found in index. Try re-indexing the repo."}
        sys = (
            "You are a senior code reviewer. Review this code carefully \n"
            "and return ONLY valid JSON with no extra text:\n"
            "{\n"
            "  'bugs': [{'line': N, 'description': '...', 'severity': 'high/medium/low'}],\n"
            "  'security_issues': [{'line': N, 'description': '...'}],\n"
            "  'missing_error_handling': [{'line': N, 'description': '...'}],\n"
            "  'overall_quality': 'good/needs_improvement/poor',\n"
            "  'summary': '2-3 sentence overall assessment'\n"
            "}\n"
            "Only report real issues. Be specific with line numbers.\n"
            "If no issues found in a category return an empty array."
        )
        payload = f"File: {file_path}\n\nFull content:\n{full_content}"
        try:
            return await _ask(sys, payload)
        except Exception:
            return {"error": "Claude response could not be parsed. Please try again."}

    async def suggest_improvements(self, file_path: str) -> dict[str, Any]:
        full_content = await self._get_full_file(file_path)
        if not full_content:
            return {"error": "File not found in index. Try re-indexing the repo."}
        sys = (
            "You are a senior software engineer. Suggest improvements \n"
            "for this code and return ONLY valid JSON with no extra text:\n"
            "{\n"
            "  'improvements': [\n"
            "    {\n"
            "      'type': 'performance/readability/refactoring/best_practice',\n"
            "      'line': N,\n"
            "      'description': '...',\n"
            "      'suggestion': 'specific code or approach to use instead'\n"
            "    }\n"
            "  ],\n"
            "  'summary': '2-3 sentence overall assessment'\n"
            "}\n"
            "Focus on meaningful improvements not style preferences.\n"
            "Return maximum 5 most impactful improvements."
        )
        payload = f"File: {file_path}\n\nFull content:\n{full_content}"
        try:
            return await _ask(sys, payload)
        except Exception:
            return {"error": "Claude response could not be parsed. Please try again."}

    async def generate_fix(self, file_path: str, issue: str) -> dict[str, Any]:
        if not (issue or "").strip():
            return {"error": "Please describe the issue to fix."}
        full_content = await self._get_full_file(file_path)
        if not full_content:
            return {"error": "File not found in index. Try re-indexing the repo."}
        sys = (
            "You are a senior engineer. Generate a fix for this issue \n"
            "and return ONLY valid JSON with no extra text:\n"
            "{\n"
            "  'issue_description': '...',\n"
            "  'original_code': 'the relevant code snippet before fix',\n"
            "  'fixed_code': 'the corrected code snippet',\n"
            "  'explanation': 'why this fix works',\n"
            "  'line_start': N,\n"
            "  'line_end': N\n"
            "}\n"
            "Keep the fix minimal and focused on the specific issue.\n"
            "IMPORTANT: The original_code field must contain the EXACT code from "
            "the file provided, not reconstructed or paraphrased code."
        )
        payload = (
            f"File: {file_path}\n"
            f"Issue: {issue.strip()}\n\n"
            f"Full content:\n{full_content}"
        )
        try:
            return await _ask(sys, payload)
        except Exception:
            return {"error": "Claude response could not be parsed. Please try again."}


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
        elif qtype == "review":
            fp = (payload.get("question") or "").strip()
            ans = await eng.review_file(fp)
        elif qtype == "improve":
            fp = (payload.get("question") or "").strip()
            ans = await eng.suggest_improvements(fp)
        elif qtype == "fix":
            raw = (payload.get("question") or "").strip()
            fp, issue = "", ""
            if "||" in raw:
                fp, issue = raw.split("||", 1)
            else:
                fp, issue = raw, ""
            ans = await eng.generate_fix(fp.strip(), issue.strip())
        else:
            ans = {"error": "unknown query_type"}
        await qh.insert_query_history(uuid4(), repo_uuid, qtype, json.dumps(payload), ans)
        return ans
    finally:
        await eng.close()
