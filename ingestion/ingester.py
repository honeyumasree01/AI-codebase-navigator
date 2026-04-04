import asyncio
import hashlib
import json
import shutil
from pathlib import Path
from uuid import UUID

import redis.asyncio as aioredis

from db import queries
from db.bulk_files import bulk_save_files
from graph.neo4j_client import Neo4jClient
from ingestion.chunker import chunks_from_source
from ingestion.clone import clone_to_temp
from ingestion.parser import lang_for_path, parse_file
from ingestion.paths import resolve_import_path
from ingestion.scan import is_binary, walk_code_files
from ingestion.tree_util import nest_paths
from utils.config import get_settings
from utils.embeddings import embed_texts
from utils.pinecone_store import delete_namespace, upsert_batch

_MAX_CODE_FILES = 500
_EMBED_CHUNK = 100


def _vid(repo_id: str, ch: dict) -> str:
    raw = f"{repo_id}:{ch['file_path']}:{ch['start_line']}:{ch['function_name']}"
    return hashlib.sha256(raw.encode()).hexdigest()[:48]


def _meta(ch: dict) -> dict:
    return {
        "file_path": ch["file_path"],
        "start_line": int(ch["start_line"]),
        "end_line": int(ch["end_line"]),
        "function_name": ch["function_name"],
        "language": ch["language"],
        "repo_id": ch.get("repo_id", ""),
    }


async def _pub(
    ar: aioredis.Redis, repo_id: str, stage: str, pct: float, cur: str
) -> None:
    await ar.publish(
        f"ingest:{repo_id}",
        json.dumps({"stage": stage, "progress_pct": round(pct, 2), "current_file": cur}),
    )


async def run_ingest(repo_id: str, github_url: str) -> None:
    s = get_settings()
    ar = aioredis.from_url(s.redis_url, decode_responses=True)
    neo = Neo4jClient()
    tmp: str | None = None
    uid = UUID(repo_id)
    try:
        await queries.update_repo_status(uid, "processing")
        await _pub(ar, repo_id, "clone", 2, "")
        tmp = await asyncio.to_thread(clone_to_temp, github_url)
        root = Path(tmp)
        files = walk_code_files(root)
        if len(files) > _MAX_CODE_FILES:
            msg = "Repo too large for indexing (max 500 files)"
            await _pub(ar, repo_id, "failed", 0, "")
            raise ValueError(msg)
        fset = set(files)
        await neo.clear_repo(repo_id)
        delete_namespace(repo_id)
        all_chunks: list[dict] = []
        rows: list[tuple[str, str]] = []
        n = len(files)
        for i, rel in enumerate(files):
            await _pub(ar, repo_id, "parse", 5 + 85 * (i / max(1, n)), rel)
            fp = root / rel
            raw_b = fp.read_bytes()
            if is_binary(raw_b):
                continue
            text = raw_b.decode("utf-8", errors="replace")
            rows.append((rel.replace("\\", "/"), text))
            syms, imps = parse_file(rel, raw_b)
            lang = lang_for_path(rel) or ""
            rel_key = rel.replace("\\", "/")
            for e in imps:
                tgt = resolve_import_path(fset, rel, e.source, lang)
                if tgt:
                    await neo.store_import(repo_id, rel_key, tgt)
            await neo.ensure_file(repo_id, rel_key)
            for sym in syms:
                await neo.store_function(
                    repo_id, rel_key, sym.name, sym.start_line, sym.end_line
                )
            for ch in chunks_from_source(rel, text, syms):
                ch["repo_id"] = repo_id
                all_chunks.append(ch)
        chunk_total = 0
        for i in range(0, len(all_chunks), _EMBED_CHUNK):
            part = all_chunks[i : i + _EMBED_CHUNK]
            await _pub(
                ar,
                repo_id,
                "embed",
                90 + 10 * (i / max(1, len(all_chunks))),
                f"embed {min(i + len(part), len(all_chunks))}/{len(all_chunks)}",
            )
            vecs = await asyncio.to_thread(embed_texts, [c["text"] for c in part])
            ups = [
                (_vid(repo_id, c), vecs[j], _meta(c))
                for j, c in enumerate(part)
            ]
            await asyncio.to_thread(upsert_batch, repo_id, ups)
            chunk_total += len(ups)
        await bulk_save_files(uid, rows)
        await queries.update_repo_status(
            uid,
            "complete",
            file_count=n,
            chunk_count=chunk_total,
            file_tree=nest_paths(files),
        )
        await _pub(ar, repo_id, "done", 100, "")
    except Exception as e:
        await queries.update_repo_status(
            uid, "failed", error_message=str(e)[:2000]
        )
        raise
    finally:
        if tmp:
            await asyncio.to_thread(shutil.rmtree, tmp, True)
        await neo.close()
        await ar.aclose()


def ingest_repo_sync(repo_id: str, github_url: str) -> None:
    asyncio.run(run_ingest(repo_id, github_url))
