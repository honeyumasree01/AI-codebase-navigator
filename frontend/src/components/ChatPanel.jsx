import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { postQueryStream } from "../hooks/useSSE.js";

const mono = { fontFamily: '"Courier New", Courier, monospace' };

function clampLine(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : null;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function userPreviewFromBody(body) {
  const t = body?.query_type;
  if (t === "location") return String(body?.question ?? "");
  if (t === "impact") return String(body?.symbol ?? body?.question ?? "");
  if (t === "explain") return String(body?.file_path ?? body?.question ?? "");
  if (t === "flow") {
    const a = String(body?.from_symbol ?? "").trim();
    const b = String(body?.to_symbol ?? "").trim();
    return `${a} → ${b}`;
  }
  if (t === "review" || t === "improve") return String(body?.question ?? "");
  if (t === "fix") {
    const raw = String(body?.question ?? "");
    const [p, issue] = raw.split("||", 2);
    return issue?.trim() ? `${p?.trim() || ""} — ${issue.trim()}` : raw;
  }
  return JSON.stringify(body);
}

/** ---------- AI message renderers ---------- */

function OverallPill({ quality }) {
  const q = String(quality || "").toLowerCase().trim();
  let bg = "#1a1a0a";
  let color = "#facc15";
  if (q === "good") {
    bg = "#0d1f0d";
    color = "#4ade80";
  } else if (q === "poor") {
    bg = "#1a0a0a";
    color = "#ef4444";
  } else if (q === "needs_improvement") {
    bg = "#1a1a0a";
    color = "#f5a623";
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        background: bg,
        color,
        border: "1px solid #2a2a2d",
        ...mono,
      }}
    >
      {q.replace(/_/g, " ").toUpperCase() || "—"}
    </span>
  );
}

function ReviewCard({ data, filePath }) {
  const bugs = Array.isArray(data?.bugs) ? data.bugs : [];
  const sec = Array.isArray(data?.security_issues) ? data.security_issues : [];
  const meh = Array.isArray(data?.missing_error_handling) ? data.missing_error_handling : [];

  const bugBadge = (sev) => {
    const s = String(sev || "").toLowerCase().trim();
    if (s === "high") return { bg: "#3a1a1a", color: "#ef4444", label: "HIGH" };
    if (s === "medium") return { bg: "#2a1a0a", color: "#f5a623", label: "MED" };
    if (s === "low") return { bg: "#0a1220", color: "#3b82f6", label: "LOW" };
    return { bg: "#1a1a0a", color: "#facc15", label: "WARN" };
  };

  return (
    <div style={{ ...mono, fontSize: 12 }}>
      {filePath ? (
        <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>{filePath}</div>
      ) : null}
      <OverallPill quality={data?.overall_quality} />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {bugs.map((b, i) => {
          const { bg, color, label } = bugBadge(b?.severity);
          return (
            <div key={`b-${i}`}>
              <span style={{ background: bg, color, padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                {label}
              </span>
              <div style={{ marginTop: 4, color: "#c4c4c4" }}>
                line {clampLine(b?.line) ?? "—"} · {String(b?.description || "")}
              </div>
            </div>
          );
        })}
        {sec.map((s, i) => (
          <div key={`s-${i}`}>
            <span
              style={{
                background: "#2a1a0a",
                color: "#f5a623",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              SECURITY
            </span>
            <div style={{ marginTop: 4, color: "#c4c4c4" }}>
              line {clampLine(s?.line) ?? "—"} · {String(s?.description || "")}
            </div>
          </div>
        ))}
        {meh.map((m, i) => (
          <div key={`m-${i}`}>
            <span
              style={{
                background: "#1a1a0a",
                color: "#facc15",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              WARN
            </span>
            <div style={{ marginTop: 4, color: "#c4c4c4" }}>
              line {clampLine(m?.line) ?? "—"} · {String(m?.description || "")}
            </div>
          </div>
        ))}
      </div>
      {data?.summary ? <div style={{ marginTop: 10, color: "#888", fontSize: 11 }}>{String(data.summary)}</div> : null}
    </div>
  );
}

function ImproveCard({ data }) {
  const items = Array.isArray(data?.improvements) ? data.improvements : [];
  const typeLabel = (t) =>
    String(t || "")
      .replace(/_/g, " ")
      .toUpperCase() || "ITEM";

  return (
    <div style={{ ...mono, fontSize: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <div key={i}>
          <span
            style={{
              background: "#0a1220",
              color: "#60a5fa",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              border: "1px solid #1a2a3a",
            }}
          >
            {typeLabel(it?.type)}
          </span>
          <div style={{ marginTop: 8, color: "#c4c4c4" }}>
            line {clampLine(it?.line) ?? "—"} · {String(it?.description || "")}
          </div>
          {it?.suggestion ? (
            <div style={{ marginTop: 4, color: "#7aa8ff", fontSize: 11 }}>{String(it.suggestion)}</div>
          ) : null}
        </div>
      ))}
      {data?.summary ? <div style={{ marginTop: 4, color: "#888", fontSize: 11 }}>{String(data.summary)}</div> : null}
    </div>
  );
}

function FixCard({ data, filePath }) {
  const ls = clampLine(data?.line_start);
  const lineTitle = ls != null ? ` · line ${ls}` : "";
  const boxBefore = {
    background: "#1a0a0a",
    border: "1px solid #3a1a1a",
    color: "#f87171",
    padding: 10,
    borderRadius: 4,
    overflowX: "auto",
    whiteSpace: "pre",
    fontSize: 11,
    lineHeight: 1.35,
  };
  const boxAfter = {
    background: "#0a1a0a",
    border: "1px solid #1a3a1a",
    color: "#86efac",
    padding: 10,
    borderRadius: 4,
    overflowX: "auto",
    whiteSpace: "pre",
    fontSize: 11,
    lineHeight: 1.35,
  };

  return (
    <div style={{ ...mono }}>
      <div style={{ fontSize: 12, color: "#e0c97a", marginBottom: 8 }}>
        FIX · {filePath || "—"}
        {lineTitle}
      </div>
      <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>BEFORE</div>
      <pre style={boxBefore}>{String(data?.original_code || "").trim() || "—"}</pre>
      <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>AFTER</div>
      <pre style={boxAfter}>{String(data?.fixed_code || "").trim() || "—"}</pre>
      {data?.explanation ? <div style={{ marginTop: 10, color: "#888", fontSize: 11 }}>{String(data.explanation)}</div> : null}
    </div>
  );
}

const ChatPanel = forwardRef(function ChatPanel(
  { repoId, getBearerToken, apiBase, onRefs, onOpen },
  ref
) {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const runQuery = useCallback(
    async (body, userDisplayText) => {
      const display = (userDisplayText ?? "").trim() || userPreviewFromBody(body);
      if (!repoId?.trim()) {
        setMessages((m) => [
          ...m,
          { id: uid(), role: "user", text: display },
          { id: uid(), role: "ai", variant: "error", errorText: "Connect a repository first." },
        ]);
        return;
      }
      const auth = getBearerToken?.() ?? "";
      if (!auth?.trim()) {
        setMessages((m) => [
          ...m,
          { id: uid(), role: "user", text: display },
          { id: uid(), role: "ai", variant: "error", errorText: "Set the API token (or VITE_API_TOKEN in .env)." },
        ]);
        return;
      }

      const submittedType = body?.query_type;
      let submittedPath = String(body?.file_path || body?.question || "");
      if (submittedType === "review" || submittedType === "improve") submittedPath = String(body?.question || "");
      if (submittedType === "fix") submittedPath = String(body?.question || "").split("||", 1)[0] || "";

      const userId = uid();
      const aiId = uid();
      setStreaming(true);
      setMessages((m) => [
        ...m,
        { id: userId, role: "user", text: display },
        {
          id: aiId,
          role: "ai",
          variant: "pending",
          queryType: submittedType,
          filePath: submittedPath,
          streamText: "",
          completeData: null,
        },
      ]);

      let acc = "";
      try {
        await postQueryStream(
          `${apiBase}/repos/${repoId}/query`,
          getBearerToken,
          body,
          (ev, data) => {
            if (ev === "token") {
              acc += data;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === aiId
                    ? { ...msg, variant: "stream", streamText: acc, queryType: submittedType }
                    : msg
                )
              );
            }
            if (ev === "complete") {
              try {
                const j = JSON.parse(data);
                const refs = [];
                if (j.references) {
                  for (const r of j.references) refs.push({ file: r.file, line: r.line });
                }
                onRefs?.(refs);
                setMessages((m) =>
                  m.map((msg) => {
                    if (msg.id !== aiId) return msg;
                    if (j.error) {
                      return {
                        ...msg,
                        variant: "error",
                        errorText: String(j.error),
                        queryType: submittedType,
                      };
                    }
                    const out = { ...j, __query_type: submittedType, __file_path: submittedPath };
                    if (submittedType === "review" || submittedType === "improve" || submittedType === "fix") {
                      return {
                        ...msg,
                        variant: submittedType,
                        completeData: out,
                        streamText: "",
                        queryType: submittedType,
                        filePath: submittedPath,
                      };
                    }
                    const text =
                      j.answer ??
                      j.explanation ??
                      j.summary ??
                      (typeof j === "object" ? JSON.stringify(j) : String(j));
                    return {
                      ...msg,
                      variant: "answer",
                      streamText: acc || String(text),
                      completeData: j,
                      references: j.references || [],
                      queryType: submittedType,
                    };
                  })
                );
              } catch {
                void 0;
              }
            }
            if (ev === "error") {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === aiId
                    ? { ...msg, variant: "error", errorText: String(data), queryType: submittedType }
                    : msg
                )
              );
            }
          }
        );
      } catch (e) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === aiId
              ? { ...msg, variant: "error", errorText: e instanceof Error ? e.message : String(e) }
              : msg
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [apiBase, getBearerToken, onRefs, repoId]
  );

  useImperativeHandle(
    ref,
    () => ({
      runQuery: (body, userDisplayText) => {
        void runQuery(body, userDisplayText);
      },
    }),
    [runQuery]
  );

  function sendFromInput() {
    const text = q.trim();
    if (!text) return;
    void runQuery({ query_type: "location", question: text }, text);
    setQ("");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        ...mono,
      }}
    >
      <div style={{ flexShrink: 0, paddingBottom: 8, borderBottom: "1px solid #1f1f24" }}>
        <div style={{ fontSize: 11, color: "#888", letterSpacing: "0.12em" }}>AI ASSISTANT</div>
        <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>ask anything about the code</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 10, paddingBottom: 8 }}>
        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#f5a623", fontWeight: 700, marginBottom: 4 }}>YOU</div>
                <div
                  style={{
                    background: "#111109",
                    borderLeft: "3px solid #f5a623",
                    padding: "8px 10px",
                    color: "#e0c97a",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.role === "ai") {
            if (msg.variant === "error") {
              return (
                <div key={msg.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 4 }}>AI</div>
                  <div style={{ color: "#ef4444", fontSize: 12 }}>{msg.errorText}</div>
                </div>
              );
            }

            if (msg.variant === "pending") {
              return (
                <div key={msg.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>AI</div>
                  <div style={{ color: "#666", fontSize: 12 }}>…</div>
                </div>
              );
            }

            if (msg.variant === "review") {
              return (
                <div key={msg.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 700, marginBottom: 6 }}>AI · REVIEW</div>
                  <div style={{ background: "#0f0f12", border: "1px solid #1f1f24", padding: 10, borderRadius: 4 }}>
                    <ReviewCard data={msg.completeData} filePath={msg.filePath} />
                  </div>
                </div>
              );
            }

            if (msg.variant === "improve") {
              return (
                <div key={msg.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, marginBottom: 6 }}>AI · IMPROVEMENTS</div>
                  <div style={{ background: "#0f0f12", border: "1px solid #1f1f24", padding: 10, borderRadius: 4 }}>
                    <ImproveCard data={msg.completeData} />
                  </div>
                </div>
              );
            }

            if (msg.variant === "fix") {
              return (
                <div key={msg.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#f5a623", fontWeight: 700, marginBottom: 6 }}>AI · FIX</div>
                  <div style={{ background: "#0f0f12", border: "1px solid #1f1f24", padding: 10, borderRadius: 4 }}>
                    <FixCard data={msg.completeData} filePath={msg.filePath} />
                  </div>
                </div>
              );
            }

            const refs = msg.completeData?.references || msg.references || [];
            if (msg.variant === "stream" || msg.variant === "answer") {
              return (
                <div key={msg.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 700, marginBottom: 6 }}>AI · ANSWER</div>
                  <div
                    style={{
                      background: "#0f0f12",
                      border: "1px solid #1f1f24",
                      padding: "10px 10px",
                      color: "#c4c4c4",
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.streamText || ""}
                  </div>
                  {refs.length > 0 ? (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {refs.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onOpen?.(r.file, r.line)}
                          style={{
                            ...mono,
                            fontSize: 10,
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #1a3a1a",
                            background: "#0d1f0d",
                            color: "#4ade80",
                            cursor: "pointer",
                          }}
                        >
                          {r.file}:{r.line}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return null;
          }
          return null;
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ flexShrink: 0, paddingTop: 8, borderTop: "1px solid #1f1f24" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 8 }}>
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendFromInput();
              }
            }}
            placeholder="Ask about the code, or click Review/Improve/Fix..."
            rows={3}
            disabled={streaming}
            style={{
              flex: 1,
              resize: "none",
              background: "#0a0a0b",
              border: "1px solid #1f1f24",
              color: "#aaa",
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          />
          <button
            type="button"
            title="Send"
            onClick={sendFromInput}
            disabled={streaming || !q.trim()}
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              alignSelf: "flex-end",
              borderRadius: "50%",
              border: "none",
              background: "#f5a623",
              color: "#0d0d0f",
              cursor: streaming || !q.trim() ? "not-allowed" : "pointer",
              fontSize: 16,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
});

ChatPanel.displayName = "ChatPanel";

export default ChatPanel;
