def nest_paths(paths: list[str]) -> dict:
    root: dict = {}
    for p in sorted(paths):
        parts = [x for x in p.replace("\\", "/").split("/") if x]
        d = root
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        if parts:
            d[parts[-1]] = None
    return root
