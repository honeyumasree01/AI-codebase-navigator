from pathlib import Path


def _cands(base: str, lang: str) -> list[str]:
    b = base.replace("\\", "/")
    suf: list[str] = [""]
    if lang == "python":
        suf = ["", ".py", "/__init__.py"]
    elif lang == "go":
        suf = ["", ".go"]
    else:
        suf = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"]
    return [b + s for s in suf]


def resolve_import_path(
    files: set[str], current: str, mod: str, lang: str
) -> str | None:
    mod = mod.strip().strip('"').strip("'")
    if not mod:
        return None
    if lang in ("javascript", "typescript", "tsx") and not mod.startswith("."):
        return None
    if lang == "go" and not mod.startswith("."):
        return None
    cur = Path(current)
    if mod.startswith("."):
        raw = (cur.parent / mod).as_posix().replace("\\", "/")
        for c in _cands(raw, lang):
            if c in files:
                return c
            if c.startswith("/"):
                continue
            if c.lstrip("./") in {f.lstrip("./") for f in files}:
                for f in files:
                    if f.endswith(c.lstrip("./")) or c.endswith(f):
                        return f
        return None
    if lang == "python":
        base = mod.replace(".", "/")
        for c in _cands(base, "python"):
            if c in files:
                return c
    return None
