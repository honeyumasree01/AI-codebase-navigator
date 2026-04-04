from tree_sitter import Language, Parser

import tree_sitter_go as tsgo
import tree_sitter_java as tsjava
import tree_sitter_javascript as tsjs
import tree_sitter_python as tsp
import tree_sitter_typescript as tsts

from ingestion.parser_imports import extract_imports
from ingestion.parser_types import ImportEdge, Symbol, lang_for_path

# Parsed when we add tree-sitter grammars; still indexed via chunker module fallback
_NO_TS_LANG = frozenset({"ruby", "php", "csharp", "cpp", "c"})


def _parser(name: str) -> Parser:
    if name == "python":
        lng = Language(tsp.language())
    elif name in ("javascript",):
        lng = Language(tsjs.language())
    elif name == "typescript":
        lng = Language(tsts.language_typescript())
    elif name == "tsx":
        lng = Language(tsts.language_tsx())
    elif name == "java":
        lng = Language(tsjava.language())
    elif name == "go":
        lng = Language(tsgo.language())
    else:
        raise ValueError(name)
    return Parser(lng)


def _py_walk(node, syms: list[Symbol]) -> None:
    t = node.type
    if t in ("function_definition", "class_definition"):
        nm = node.child_by_field_name("name")
        if nm:
            syms.append(
                Symbol(
                    kind="class" if t == "class_definition" else "function",
                    name=nm.text.decode(),
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
            )
    for i in range(node.named_child_count):
        _py_walk(node.named_children[i], syms)


def _js_walk(node, syms: list[Symbol]) -> None:
    t = node.type
    if t in (
        "function_declaration",
        "class_declaration",
        "method_definition",
        "arrow_function",
        "generator_function",
    ):
        nm = node.child_by_field_name("name")
        if nm is not None:
            syms.append(
                Symbol(
                    kind="class" if t == "class_declaration" else "function",
                    name=nm.text.decode(),
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
            )
    for i in range(node.named_child_count):
        _js_walk(node.named_children[i], syms)


def _java_walk(node, syms: list[Symbol]) -> None:
    t = node.type
    if t in ("method_declaration", "constructor_declaration", "class_declaration"):
        nm = node.child_by_field_name("name")
        if nm:
            syms.append(
                Symbol(
                    kind="class" if t == "class_declaration" else "function",
                    name=nm.text.decode(),
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
            )
    for i in range(node.named_child_count):
        _java_walk(node.named_children[i], syms)


def _go_walk(node, syms: list[Symbol]) -> None:
    t = node.type
    if t in ("function_declaration", "method_declaration"):
        nm = node.child_by_field_name("name")
        if nm:
            syms.append(
                Symbol(
                    kind="function",
                    name=nm.text.decode(),
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
            )
    if t == "type_declaration":
        for ch in node.named_children:
            if ch.type == "type_spec":
                idn = ch.child_by_field_name("name")
                if idn:
                    syms.append(
                        Symbol(
                            kind="class",
                            name=idn.text.decode(),
                            start_line=ch.start_point[0] + 1,
                            end_line=ch.end_point[0] + 1,
                        )
                    )
    for i in range(node.named_child_count):
        _go_walk(node.named_children[i], syms)


def parse_file(rel_path: str, src: bytes) -> tuple[list[Symbol], list[ImportEdge]]:
    lang = lang_for_path(rel_path)
    if not lang:
        return [], []
    if lang in _NO_TS_LANG:
        return [], []
    p = _parser(lang)
    root = p.parse(src).root_node
    syms: list[Symbol] = []
    if lang == "python":
        _py_walk(root, syms)
    elif lang in ("javascript", "typescript", "tsx"):
        _js_walk(root, syms)
    elif lang == "java":
        _java_walk(root, syms)
    elif lang == "go":
        _go_walk(root, syms)
    return syms, extract_imports(lang, root, rel_path)

