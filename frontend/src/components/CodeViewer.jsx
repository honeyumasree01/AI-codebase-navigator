import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useRef } from "react";

function langExt(path) {
  const p = (path || "").toLowerCase();
  if (p.endsWith(".py")) return python();
  if (p.endsWith(".go")) return go();
  if (p.endsWith(".java")) return java();
  return javascript({ jsx: true, typescript: true });
}

function hiField(nums) {
  const pick = new Set(nums || []);
  const mk = () =>
    Decoration.line({ attributes: { style: "background:rgba(34,197,94,0.14)" } });
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
      oneDark,
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

  return <div ref={ref} style={{ height: "100%", fontSize: 13 }} />;
}
