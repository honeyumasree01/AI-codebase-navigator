from dataclasses import dataclass
from pathlib import Path

_EXT = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".java": "java",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
}


@dataclass
class Symbol:
    kind: str
    name: str
    start_line: int
    end_line: int


@dataclass
class ImportEdge:
    source: str


def lang_for_path(p: Path | str) -> str | None:
    suf = Path(p).suffix.lower()
    return _EXT.get(suf)
