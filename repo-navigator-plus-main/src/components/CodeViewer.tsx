import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

function getLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "js": case "jsx": case "mjs": return javascript({ jsx: true });
    case "ts": case "tsx": return javascript({ jsx: true, typescript: true });
    case "py": return python();
    case "html": case "htm": return html();
    case "css": case "scss": return css();
    case "json": return json();
    default: return [];
  }
}

const greenLineDeco = Decoration.line({ class: "cm-highlighted-line" });

function highlightPlugin(lines: Set<number>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (let i = 1; i <= view.state.doc.lines; i++) {
          if (lines.has(i)) {
            const line = view.state.doc.line(i);
            builder.add(line.from, line.from, greenLineDeco);
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

interface CodeViewerProps {
  filePath: string | null;
  content: string;
  highlightedLines: Set<number>;
  scrollToLine?: number;
}

export function CodeViewer({ filePath, content, highlightedLines, scrollToLine }: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    viewRef.current?.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        oneDark,
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        ...(filePath ? [getLanguage(filePath)] : []).flat(),
        highlightPlugin(highlightedLines),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
          ".cm-highlighted-line": { backgroundColor: "hsla(142, 71%, 45%, 0.15) !important" },
          ".cm-gutters": { backgroundColor: "hsl(220, 13%, 8%)", border: "none" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    if (scrollToLine && scrollToLine > 0 && scrollToLine <= view.state.doc.lines) {
      const line = view.state.doc.line(scrollToLine);
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
    }

    return () => view.destroy();
  }, [content, filePath, highlightedLines, scrollToLine]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a file to view its contents
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-[hsl(var(--ide-border))] bg-[hsl(var(--ide-bg))]">
        {filePath}
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
