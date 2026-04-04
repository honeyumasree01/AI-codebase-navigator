from ingestion.parser import Symbol, lang_for_path


def chunks_from_source(
    rel_path: str, src: str, symbols: list[Symbol]
) -> list[dict]:
    lang = lang_for_path(rel_path) or "text"
    lines = src.splitlines(keepends=True)
    if not lines:
        return []
    out: list[dict] = []
    seen: set[tuple[int, int]] = set()
    for s in symbols:
        key = (s.start_line, s.end_line)
        if key in seen:
            continue
        seen.add(key)
        sl = max(1, s.start_line)
        el = min(len(lines), s.end_line)
        chunk_lines = lines[sl - 1 : el]
        text = "".join(chunk_lines).strip()
        if len(text) < 8:
            continue
        out.append(
            {
                "text": text,
                "start_line": sl,
                "end_line": el,
                "function_name": s.name,
                "kind": s.kind,
                "language": lang,
                "file_path": rel_path.replace("\\", "/"),
            }
        )
    if not out and src.strip():
        out.append(
            {
                "text": src[:8000],
                "start_line": 1,
                "end_line": len(lines),
                "function_name": "__module__",
                "kind": "module",
                "language": lang,
                "file_path": rel_path.replace("\\", "/"),
            }
        )
    return out
