from openai import OpenAI

from utils.config import get_settings

_DIM = 1536
# OpenAI allows many inputs per request; batch for reliability and throughput
_EMBED_BATCH = 100
# text-embedding-3-small max ~8192 tokens; stay under with a char cap
_MAX_EMBED_CHARS = 24000
_client: OpenAI | None = None


def _clip(s: str) -> str:
    if len(s) <= _MAX_EMBED_CHARS:
        return s
    return s[:_MAX_EMBED_CHARS]


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=get_settings().openai_api_key)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    clipped = [_clip(t) for t in texts]
    out: list[list[float]] = []
    for i in range(0, len(clipped), _EMBED_BATCH):
        chunk = clipped[i : i + _EMBED_BATCH]
        r = _get_client().embeddings.create(
            model="text-embedding-3-small", input=chunk
        )
        ordered = sorted(r.data, key=lambda d: d.index)
        out.extend(d.embedding for d in ordered)
    return out


def embed_text(text: str) -> list[float]:
    v = embed_texts([text])
    return v[0] if v else [0.0] * _DIM


def embedding_dim() -> int:
    return _DIM
