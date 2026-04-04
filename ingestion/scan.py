import os
from pathlib import Path

# Allowlisted source extensions only (.md/.json/etc. never match path.suffix)
_CODE_EXTENSIONS: frozenset[str] = frozenset({
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".java",
    ".go",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".c",
    ".h",
})

SKIP_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    "venv",
    ".venv",
    "dist",
    "build",
    ".next",
    "target",
    ".idea",
}
MAX_BYTES = 500_000


def is_binary(b: bytes) -> bool:
    return b"\0" in b[:8192]


def _is_code_file(path: Path) -> bool:
    name = path.name.lower()
    if name.endswith(".lock"):
        return False
    return path.suffix.lower() in _CODE_EXTENSIONS


def walk_code_files(root: Path) -> list[str]:
    out: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if not _is_code_file(p):
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            if st.st_size > MAX_BYTES:
                continue
            rel = p.relative_to(root).as_posix()
            out.append(rel)
    return out
