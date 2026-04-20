import { useCallback, useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel.jsx";
import CodeViewer from "./components/CodeViewer.jsx";
import FileTree from "./components/FileTree.jsx";
import { useRepo } from "./hooks/useRepo.js";
import { getSSE } from "./hooks/useSSE.js";
import { firstFilePathInTree } from "./utils/tree.js";

export default function App() {
  const {
    repoId,
    meta,
    tree,
    connect,
    loadTree,
    token,
    setApiToken,
    getBearerToken,
    apiBase,
    repoUrl,
    setRepoUrl,
    clearStaleRepo,
  } = useRepo();
  const base = apiBase();
  const chatRef = useRef(null);
  const [sessionRepoId, setSessionRepoId] = useState(null);
  const [file, setFile] = useState(null);
  const [lines, setLines] = useState([]);
  const [hi, setHi] = useState([]);
  const [refs, setRefs] = useState([]);
  const [pct, setPct] = useState(0);
  const [metaLocal, setMetaLocal] = useState(meta);
  const [treeOpen, setTreeOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixIssue, setFixIssue] = useState("");
  const initialFileOpenedRef = useRef(false);

  useEffect(() => {
    setMetaLocal(meta);
  }, [meta]);

  useEffect(() => {
    setSessionRepoId(repoId || null);
  }, [repoId]);

  useEffect(() => {
    initialFileOpenedRef.current = false;
  }, [sessionRepoId, repoId]);

  const pullMeta = useCallback(
    async (rid) => {
      const r = await fetch(`${base}/repos/${rid}`, {
        headers: { Authorization: `Bearer ${getBearerToken()}` },
      });
      if (r.status === 404) {
        clearStaleRepo();
        return;
      }
      if (!r.ok) return;
      const j = await r.json();
      setMetaLocal({
        name: j.name || "",
        status: j.status || "",
        files: j.file_count ?? 0,
        chunks: j.chunk_count ?? 0,
      });
      setPct(j.status === "complete" ? 100 : 35);
      if (j.github_url) setRepoUrl(j.github_url);
    },
    [base, setRepoUrl, getBearerToken, clearStaleRepo]
  );

  useEffect(() => {
    const auth = getBearerToken();
    if (!repoId || !auth) return;
    void pullMeta(repoId);
    void loadTree(repoId);
  }, [repoId, base, pullMeta, loadTree, getBearerToken]);

  const effectiveRepoId = sessionRepoId ?? repoId;

  const openFile = useCallback(
    async (path, line) => {
      const id = effectiveRepoId;
      if (!id) return;
      setFile(path);
      const r = await fetch(`${base}/repos/${id}/file?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${getBearerToken()}` },
      });
      if (!r.ok) return;
      const j = await r.json();
      setLines(j.lines || []);
      setHi(line ? [line] : []);
    },
    [base, effectiveRepoId, getBearerToken]
  );

  useEffect(() => {
    if (!effectiveRepoId || !tree || initialFileOpenedRef.current) return;
    const p = firstFilePathInTree(tree);
    if (p) {
      initialFileOpenedRef.current = true;
      void openFile(p);
    }
  }, [effectiveRepoId, tree, openFile]);

  function pickFile(p) {
    void openFile(p);
    setTreeOpen(false);
  }

  const mono = { fontFamily: '"Courier New", Courier, monospace' };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "#0d0d0f",
        overflow: "hidden",
        ...mono,
      }}
    >
      {/* Top bar */}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          borderBottom: "1px solid #1f1f24",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              color: "#555",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            CODEBASE NAVIGATOR
          </span>
          {metaLocal.name ? (
            <span
              style={{
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 999,
                background: "#0d1f0d",
                border: "1px solid #1a3a1a",
                color: "#4ade80",
              }}
            >
              {metaLocal.name}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="Enter GitHub repo URL"
            style={{
              width: 280,
              maxWidth: "100%",
              background: "#0a0a0b",
              color: "#aaa",
              border: "1px solid #1f1f24",
              padding: "6px 10px",
              fontSize: 11,
            }}
          />
          <button
            type="button"
            onClick={async () => {
              const auth = getBearerToken();
              if (!auth) {
                window.alert("Set the API token (or VITE_API_TOKEN in .env) before connecting.");
                return;
              }
              const { repoId: rid, alreadyIndexed } = await connect(repoUrl);
              initialFileOpenedRef.current = false;
              if (alreadyIndexed) {
                setPct(100);
                void pullMeta(rid);
                void loadTree(rid);
              } else {
                try {
                  await getSSE(`${base}/repos/${rid}/status`, getBearerToken, (_, data) => {
                    try {
                      const j = JSON.parse(data);
                      setPct(Number(j.progress_pct) || 0);
                      if (j.stage === "done") {
                        void pullMeta(rid);
                        void loadTree(rid);
                      }
                    } catch {
                      void 0;
                    }
                  });
                } catch {
                  void 0;
                }
              }
            }}
            style={{
              background: "#f5a623",
              color: "#0d0d0f",
              border: "none",
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            Connect
          </button>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Enter your API token"
            value={token}
            onChange={(e) => setApiToken(e.target.value)}
            style={{
              width: 160,
              background: "#0a0a0b",
              color: "#aaa",
              border: "1px solid #1f1f24",
              padding: "6px 10px",
              fontSize: 11,
            }}
          />
        </div>
      </header>

      {pct < 100 && metaLocal.status && metaLocal.status !== "complete" ? (
        <div style={{ height: 2, background: "#1f1f24", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#f5a623", transition: "width 0.2s" }} />
        </div>
      ) : null}

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left: code + tree */}
        <div
          style={{
            width: "52%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid #1f1f24",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderBottom: "1px solid #1f1f24",
            }}
          >
            <button
              type="button"
              title="Toggle file tree"
              onClick={() => setTreeOpen((o) => !o)}
              style={{
                background: "#111",
                color: "#888",
                border: "1px solid #2a2a2d",
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {treeOpen ? "◀" : "☰"}
            </button>
            <span style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file || "—"}
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
            {treeOpen ? (
              <div
                style={{
                  width: 200,
                  flexShrink: 0,
                  borderRight: "1px solid #1f1f24",
                  overflow: "auto",
                  background: "#0a0a0b",
                  padding: "6px 4px",
                }}
              >
                <FileTree tree={tree} onPick={(p) => pickFile(p)} refs={refs.map((r) => r.file)} />
              </div>
            ) : null}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <CodeViewer path={file || ""} lines={lines} highlight={hi} />
              </div>

              {fixOpen ? (
                <div
                  style={{
                    flexShrink: 0,
                    padding: "8px 10px",
                    borderTop: "1px solid #1f1f24",
                    background: "#0a0a0b",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>Describe the issue:</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={fixIssue}
                      onChange={(e) => setFixIssue(e.target.value)}
                      placeholder="Issue to fix"
                      style={{
                        flex: 1,
                        background: "#0d0d0f",
                        border: "1px solid #2a2a2d",
                        color: "#ccc",
                        padding: "6px 8px",
                        fontSize: 11,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const issue = (fixIssue || "").trim();
                        if (!file) return;
                        chatRef.current?.runQuery(
                          { query_type: "fix", question: `${file}||${issue}` },
                          `Fix: ${issue}`
                        );
                        setFixOpen(false);
                        setFixIssue("");
                      }}
                      style={{
                        background: "#f5a623",
                        color: "#0d0d0f",
                        border: "none",
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  gap: 8,
                  padding: "10px",
                  borderTop: "1px solid #1f1f24",
                  background: "#0d0d0f",
                }}
              >
                <button
                  type="button"
                  disabled={!file}
                  onClick={() => {
                    setFixOpen(false);
                    if (!file) return;
                    chatRef.current?.runQuery({ query_type: "review", question: file }, `Review: ${file}`);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    fontSize: 11,
                    cursor: file ? "pointer" : "not-allowed",
                    background: "#1a0a0a",
                    color: "#ef4444",
                    border: "1px solid #3a1a1a",
                    opacity: file ? 1 : 0.4,
                  }}
                >
                  ⬡ Review
                </button>
                <button
                  type="button"
                  disabled={!file}
                  onClick={() => {
                    setFixOpen(false);
                    if (!file) return;
                    chatRef.current?.runQuery({ query_type: "improve", question: file }, `Improve: ${file}`);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    fontSize: 11,
                    cursor: file ? "pointer" : "not-allowed",
                    background: "#0a0a1a",
                    color: "#60a5fa",
                    border: "1px solid #1a1a3a",
                    opacity: file ? 1 : 0.4,
                  }}
                >
                  ⬡ Improve
                </button>
                <button
                  type="button"
                  disabled={!file}
                  onClick={() => {
                    setFixOpen((o) => !o);
                    setFixIssue("");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    fontSize: 11,
                    cursor: file ? "pointer" : "not-allowed",
                    background: "#1a1a0a",
                    color: "#f5a623",
                    border: "1px solid #3a3a1a",
                    opacity: file ? 1 : 0.4,
                  }}
                >
                  ⬡ Fix issue
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: chat */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            height: "100%",
            overflow: "hidden",
          }}
        >
          <ChatPanel
            ref={chatRef}
            repoId={effectiveRepoId ?? ""}
            getBearerToken={getBearerToken}
            apiBase={base}
            onRefs={setRefs}
            onOpen={(f, ln) => void openFile(f, ln)}
          />
        </div>
      </div>

    </div>
  );
}
