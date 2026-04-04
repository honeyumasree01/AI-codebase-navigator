import json
from typing import Any

from anthropic import Anthropic

from utils.config import get_settings


def _client() -> Anthropic:
    return Anthropic(api_key=get_settings().anthropic_api_key)


def _parse_json_object(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if not raw:
        raise ValueError("empty model response")
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            raise ValueError(f"model response is not JSON: {raw[:200]!r}") from None
        out = json.loads(raw[start : end + 1])
    if not isinstance(out, dict):
        raise ValueError("expected JSON object from model")
    return out


def invoke_claude(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.2,
    **kwargs: Any,
) -> dict[str, Any]:
    sys = kwargs.pop("system", None)
    kwargs.setdefault("model", model or get_settings().anthropic_model)
    kwargs.setdefault("max_tokens", max_tokens)
    kwargs.setdefault("temperature", temperature)
    text = _client().messages.create(
        messages=messages,
        system=sys or "Reply with JSON only. No markdown fences.",
        **kwargs,
    ).content[0]
    if text.type != "text":
        raise ValueError("unexpected content block")
    return _parse_json_object(text.text)
