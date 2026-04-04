import { useCallback, useEffect, useState } from "react";
import ChatPanel from "./components/ChatPanel.jsx";
import CodeViewer from "./components/CodeViewer.jsx";
import DependencyGraph from "./components/DependencyGraph.jsx";
import FileTree from "./components/FileTree.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { useRepo } from "./hooks/useRepo.js";
import { getSSE } from "./hooks/useSSE.js";

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
  } = useRepo();
  const base = apiBase();
  /** Set synchronously after connect + from hook so ChatPanel has repo id before next paint. */
  const [sessionRepoId, setSessionRepoId] = useState(null);
  const [file, setFile] = useState(null);
  const [lines, setLines] = useState([]);
  const [hi, setHi] = useState([]);
  const [refs, setRefs] = useState([]);
  const [graphOpen, setGraphOpen] = useState(false);
  const [edges, setEdges] = useState([]);
  const [hist, setHist] = useState([]);
  const [pct, setPct] = useState(0);
  const [metaLocal, setMetaLocal] = useState(meta);

  useEffect(() => {
    setMetaLocal(meta);
  }, [meta]);

  useEffect(() => {
    if (repoId) setSessionRepoId(repoId);
  }, [repoId]);

  const pullMeta = useCallback(
    async (rid) => {
      const r = await fetch(`${base}/repos/${rid}`, {
        headers: { Authorization: `Bearer ${getBearerToken()}` },
      });
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
    [base, setRepoUrl, getBearerToken]
  );

  useEffect(() => {
    const auth = getBearerToken();
    if (!repoId || !auth) return;
    void pullMeta(repoId);
    void loadTree(repoId);
    (async () => {
      const r = await fetch(`${base}/repos/${repoId}/history`, {
        headers: { Authorization: `Bearer ${auth}` },
      });
      if (r.ok) setHist(await r.json());
    })();
  }, [repoId, base, pullMeta, loadTree, getBearerToken]);

  const effectiveRepoId = sessionRepoId ?? repoId;

  async function openFile(path, line) {
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
    const ir = await fetch(`${base}/repos/${id}/imports?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${getBearerToken()}` },
    });
    if (ir.ok) {
      const im = await ir.json();
      const e = [];
      for (const d of im.dependencies || []) e.push({ source: path, target: d });
      for (const u of im.dependents || []) e.push({ source: u, target: path });
      setEdges(e);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 8,
          borderBottom: "1px solid #222",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="GitHub repository URL"
          style={{ flex: "1 1 200px", background: "#111", color: "#eee", border: "1px solid #333" }}
        />
        <input
          type="password"
          autoComplete="off"
          placeholder="API token"
          value={token}
          onChange={(e) => setApiToken(e.target.value)}
          title="Bearer token (or set VITE_API_TOKEN in .env)"
          style={{ width: 200, background: "#111", color: "#eee", border: "1px solid #333" }}
        />
        <button
          type="button"
          onClick={async () => {
            const auth = getBearerToken();
            console.log(
              "[Navigator] Connect click — token length:",
              auth.length,
              "value:",
              auth,
            );
            if (!auth) {
              window.alert("Set the API token (or VITE_API_TOKEN in .env) before connecting.");
              return;
            }
            const { repoId: rid, alreadyIndexed } = await connect(repoUrl);
            setSessionRepoId(rid);
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
        >
          Connect
        </button>
        <button type="button" onClick={() => setGraphOpen(true)} disabled={!file}>
          Graph
        </button>
        </div>
        {repoId ? (
          <div style={{ fontSize: 12, color: "#a3a3a3" }}>
            Connected:{" "}
            <strong style={{ color: "#e5e5e5" }}>{metaLocal.name || "repository"}</strong>
            <span style={{ opacity: 0.65, marginLeft: 10, fontFamily: "monospace", fontSize: 11 }}>
              {repoId}
            </span>
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 260, borderRight: "1px solid #222", padding: 8, overflow: "auto" }}>
          <ProgressBar pct={pct} label={metaLocal.status || "idle"} />
          <FileTree
            tree={tree}
            onPick={(p) => void openFile(p)}
            refs={refs.map((r) => r.file)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, borderRight: "1px solid #222" }}>
          <CodeViewer path={file || ""} lines={lines} highlight={hi} />
        </div>
        <div style={{ width: 340, padding: 8 }}>
          <ChatPanel
            repoId={effectiveRepoId ?? ""}
            getBearerToken={getBearerToken}
            apiBase={base}
            onRefs={setRefs}
            onOpen={(f, ln) => void openFile(f, ln)}
            history={hist}
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "6px 10px",
          fontSize: 12,
          borderTop: "1px solid #222",
          opacity: 0.85,
        }}
      >
        <span>{metaLocal.name || "—"}</span>
        <span>
          {metaLocal.status} · files {metaLocal.files ?? "—"} · chunks {metaLocal.chunks ?? "—"}
        </span>
        <span>Claude 3.5 Sonnet</span>
      </div>
      <DependencyGraph
        open={graphOpen}
        onClose={() => setGraphOpen(false)}
        center={file}
        edges={edges}
        onPick={(p) => void openFile(p)}
      />
    </div>
  );
}
