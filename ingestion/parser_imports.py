from ingestion.parser_types import ImportEdge


def extract_imports(lang: str, root, rel_path: str) -> list[ImportEdge]:
    _ = rel_path
    out: list[ImportEdge] = []

    def walk(n):
        if lang == "python":
            if n.type == "import_from_statement":
                nm = n.child_by_field_name("module_name")
                if nm:
                    out.append(ImportEdge(source=nm.text.decode()))
            elif n.type == "import_statement":
                for c in n.named_children:
                    if c.type == "dotted_name":
                        out.append(ImportEdge(source=c.text.decode()))
        elif n.type == "import_declaration" and lang == "java":
            lit = [c for c in n.children if c.type == "scoped_identifier"]
            if lit:
                out.append(ImportEdge(source=lit[0].text.decode()))
        elif n.type == "import_spec" and lang == "go":
            path = n.child_by_field_name("path")
            if path:
                out.append(ImportEdge(source=path.text.decode().strip('"')))
        elif n.type == "import_clause" or (
            n.type == "import_statement" and lang in ("javascript", "typescript", "tsx")
        ):
            for c in n.children:
                if c.type == "string":
                    out.append(ImportEdge(source=c.text.decode().strip("'\"")))
        for i in range(n.named_child_count):
            walk(n.named_children[i])

    walk(root)
    return out
