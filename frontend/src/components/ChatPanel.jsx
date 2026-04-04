import { useState } from "react";
import { postQueryStream } from "../hooks/useSSE.js";

export default function ChatPanel({ repoId, getBearerToken, apiBase, onRefs, onOpen, history }) {
  const [q, setQ] = useState("");
  const [stream, setStream] = useState("");
  const [last, setLast] = useState(null);

  async function run(body) {
    if (!repoId?.trim()) {
      setStream("Connect a repository first.");
      setLast(null);
      return;
    }
    const auth = getBearerToken?.() ?? "";
    if (!auth?.trim()) {
      setStream("Set the API token in the header or VITE_API_TOKEN in .env.");
      setLast(null);
      return;
    }
    setStream("");
    setLast(null);
    let acc = "";
    try {
      await postQueryStream(
        `${apiBase}/repos/${repoId}/query`,
        getBearerToken,
        body,
        (ev, data) => {
          if (ev === "token") {
            acc += data;
            setStream(acc);
          }
          if (ev === "complete") {
            try {
              const j = JSON.parse(data);
              setLast(j);
              setStream("");
              const refs = [];
              if (j.references)
                for (const r of j.references) refs.push({ file: r.file, line: r.line });
              onRefs?.(refs);
            } catch {
              void 0;
            }
          }
          if (ev === "error") setStream(data);
        }
      );
    } catch (e) {
      setStream(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {[
          ["Find location", { query_type: "location", question: q }],
          ["Impact", { query_type: "impact", symbol: q }],
          ["Explain file", { query_type: "explain", file_path: q }],
          [
            "Connection path",
            { query_type: "flow", from_symbol: q.split(",")[0]?.trim(), to_symbol: q.split(",")[1]?.trim() },
          ],
        ].map(([label, body]) => (
          <button
            key={label}
            type="button"
            onClick={() => run(body)}
            style={{ fontSize: 12, padding: "4px 8px", cursor: "pointer" }}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Question, symbol, file path, or from,to for path"
        rows={3}
        style={{ width: "100%", resize: "vertical", background: "#111", color: "#eee", border: "1px solid #333" }}
      />
      <div style={{ flex: 1, overflow: "auto", marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
        {stream || (last && (last.answer || last.explanation || last.summary))}
        {last?.references && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {last.references.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpen?.(r.file, r.line)}
                style={{ color: "#60a5fa", background: "none", border: "none", cursor: "pointer" }}
              >
                {r.file}:{r.line}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid #333", marginTop: 8, maxHeight: 120, overflow: "auto" }}>
        {history?.map((h) => (
          <div
            key={h.id}
            onClick={() => setQ(h.question || "")}
            style={{ fontSize: 11, opacity: 0.7, cursor: "pointer", padding: 4 }}
          >
            {h.query_type}: {h.question}
          </div>
        ))}
      </div>
    </div>
  );
}
