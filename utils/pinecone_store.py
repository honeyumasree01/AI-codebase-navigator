from typing import Any

from pinecone import Pinecone

from utils.config import get_settings

_pc: Pinecone | None = None


def _index():
    global _pc
    if _pc is None:
        s = get_settings()
        _pc = Pinecone(api_key=s.pinecone_api_key)
    return _pc.Index(get_settings().pinecone_index)


def upsert_batch(
    namespace: str, vectors: list[tuple[str, list[float], dict[str, Any]]]
) -> None:
    if not vectors:
        return
    idx = _index()
    def _meta(m: dict) -> dict:
        o: dict = {}
        for k, v in m.items():
            if isinstance(v, (str, int, float, bool)):
                o[k] = v
            else:
                o[k] = str(v)
        return o

    payload = [
        {"id": vid, "values": vec, "metadata": _meta(meta)}
        for vid, vec, meta in vectors
    ]
    idx.upsert(vectors=payload, namespace=namespace)


def query_ns(
    namespace: str, vector: list[float], top_k: int, filter_meta: dict | None = None
) -> list[dict[str, Any]]:
    idx = _index()
    kw: dict = dict(
        namespace=namespace,
        vector=vector,
        top_k=top_k,
        include_metadata=True,
    )
    if filter_meta:
        kw["filter"] = filter_meta
    q = idx.query(**kw)
    matches = getattr(q, "matches", None) or []
    out = []
    for m in matches:
        md = getattr(m, "metadata", None) or {}
        out.append(
            {
                "id": getattr(m, "id", None),
                "score": getattr(m, "score", 0.0),
                "metadata": dict(md),
            }
        )
    return out


def delete_namespace(namespace: str) -> None:
    try:
        _index().delete(delete_all=True, namespace=namespace)
    except Exception as e:
        if "not found" in str(e).lower():
            return
        raise
