import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

function langExt(path) {
  const p = (path || "").toLowerCase();
  if (p.endsWith(".py")) return python();
  if (p.endsWith(".go")) return go();
  if (p.endsWith(".java")) return java();
  return javascript({ jsx: true, typescript: true });
}

const navigatorHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: tags.operator, color: "#c792ea" },
  { tag: tags.function(tags.variableName), color: "#82aaff" },
  { tag: tags.function(tags.propertyName), color: "#82aaff" },
  { tag: tags.function(tags.name), color: "#82aaff" },
  { tag: tags.name, color: "#82aaff" },
  { tag: tags.string, color: "#c3e88d" },
  { tag: tags.comment, color: "#546e7a" },
  { tag: tags.variableName, color: "#9d9d9d" },
  { tag: tags.propertyName, color: "#9d9d9d" },
  { tag: tags.typeName, color: "#c792ea" },
  { tag: tags.number, color: "#f78c6c" },
  { tag: tags.meta, color: "#546e7a" },
]);

const editorBaseTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#0d0d0f", color: "#9d9d9d" },
    ".cm-editor": { height: "100%" },
    ".cm-scroller": { fontFamily: '"Courier New", Courier, monospace', fontSize: "13px", lineHeight: "1.45", overflow: "auto" },
    ".cm-content": { caretColor: "#9e9e9e" },
    ".cm-gutters": { backgroundColor: "#0d0d0f", color: "#2a2a2d", border: "none" },
    ".cm-lineNumbers .cm-gutterElement": { backgroundColor: "#0d0d0f", color: "#2a2a2d" },
    ".cm-activeLineGutter": { backgroundColor: "#121214" },
  },
  { dark: true }
);

function hiField(nums) {
  const pick = new Set(nums || []);
  const mk = () =>
    Decoration.line({
      attributes: {
        style: "background:#0d1f0d;color:#9fe1cb",
      },
    });
  return StateField.define({
    create(state) {
      const b = new RangeSetBuilder();
      for (let i = 1; i <= state.doc.lines; i++) {
        if (!pick.has(i)) continue;
        const ln = state.doc.line(i);
        b.add(ln.from, ln.from, mk());
      }
      return b.finish();
    },
    update(val, tr) {
      if (!tr.docChanged) return val;
      const b = new RangeSetBuilder();
      for (let i = 1; i <= tr.state.doc.lines; i++) {
        if (!pick.has(i)) continue;
        const ln = tr.state.doc.line(i);
        b.add(ln.from, ln.from, mk());
      }
      return b.finish();
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

export default function CodeViewer({ path, lines, highlight }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const text = (lines || []).map((l) => l.text).join("\n");
    const ex = [
      basicSetup,
      editorBaseTheme,
      syntaxHighlighting(navigatorHighlight, { fallback: true }),
      langExt(path || ""),
      hiField(highlight),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
    ];
    const v = new EditorView({
      state: EditorState.create({ doc: text, extensions: ex }),
      parent: ref.current,
    });
    return () => v.destroy();
  }, [path, lines, highlight]);

  return <div ref={ref} style={{ height: "100%", minHeight: 0 }} />;
}
