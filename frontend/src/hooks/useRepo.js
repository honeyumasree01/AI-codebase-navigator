import { useCallback, useEffect, useRef, useState } from "react";

const apiBase = () => (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

const LS_TOKEN = "nav_api_token";
const LS_REPO = "nav_repo";
const LS_REPO_URL = "nav_repo_url";

/** Raw secret only — never include "Bearer "; headers add that prefix. */
function normalizeRawToken(value) {
  let s = value == null ? "" : String(value).trim();
  while (/^Bearer\s+/i.test(s)) {
    s = s.replace(/^Bearer\s+/i, "").trim();
  }
  return s;
}

function readInitialRepoId() {
  try {
    return localStorage.getItem(LS_REPO) || "";
  } catch {
    return "";
  }
}

function readInitialRepoUrl() {
  try {
    const u = localStorage.getItem(LS_REPO_URL);
    if (u != null && u !== "") return u;
  } catch {
    void 0;
  }
  return "https://github.com/octocat/Hello-World";
}

function removeStoredRepoId() {
  try {
    localStorage.removeItem(LS_REPO);
  } catch {
    void 0;
  }
}

export function useRepo() {
  const [repoId, setRepoId] = useState(readInitialRepoId);
  const [meta, setMeta] = useState({ status: "", files: 0, chunks: 0, name: "" });
  const [tree, setTree] = useState(null);
  const [token, setToken] = useState("");
  /** Always up to date for fetch(); updated in setApiToken before setState. */
  const tokenRef = useRef("");
  const [repoUrl, setRepoUrlState] = useState(readInitialRepoUrl);

  useEffect(() => {
    try {
      localStorage.removeItem(LS_TOKEN);
    } catch {
      void 0;
    }
  }, []);

  const setApiToken = useCallback((value) => {
    const normalized = normalizeRawToken(value);
    tokenRef.current = normalized;
    setToken(normalized);
    try {
      if (normalized) localStorage.setItem(LS_TOKEN, normalized);
      else localStorage.removeItem(LS_TOKEN);
    } catch {
      void 0;
    }
  }, []);

  /** Keeps repo URL in state and localStorage so remounts/HMR do not reset the field. */
  const setRepoUrl = useCallback((value) => {
    setRepoUrlState(value);
    try {
      localStorage.setItem(LS_REPO_URL, value);
    } catch {
      void 0;
    }
  }, []);

  const clearStaleRepo = useCallback(() => {
    removeStoredRepoId();
    setRepoId("");
    setTree(null);
    setMeta({ status: "", files: 0, chunks: 0, name: "" });
  }, []);

  const getBearerToken = useCallback(() => {
    const fromInput = normalizeRawToken(tokenRef.current);
    if (fromInput) return fromInput;
    return normalizeRawToken(import.meta.env.VITE_API_TOKEN || "");
  }, []);

  const connect = useCallback(
    async (githubUrl) => {
      const auth = getBearerToken();
      const r = await fetch(`${apiBase()}/repos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth}`,
        },
        body: JSON.stringify({ github_url: githubUrl }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      try {
        localStorage.setItem(LS_REPO, j.repo_id);
      } catch {
        void 0;
      }
      setRepoId(j.repo_id);
      setRepoUrl(githubUrl);
      const done = Boolean(j.already_indexed);
      setMeta((m) => ({ ...m, status: done ? "complete" : "pending" }));
      return { repoId: j.repo_id, alreadyIndexed: done };
    },
    [setRepoUrl, getBearerToken]
  );

  useEffect(() => {
    if (!repoId) return;
    const auth = getBearerToken();
    if (!auth) return;
    let cancelled = false;
    (async () => {
      const r = await fetch(`${apiBase()}/repos/${encodeURIComponent(repoId)}`, {
        headers: { Authorization: `Bearer ${auth}` },
      });
      if (cancelled) return;
      if (r.status === 404) clearStaleRepo();
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, token, getBearerToken, clearStaleRepo]);

  const loadTree = useCallback(
    async (overrideId) => {
      const id = overrideId ?? repoId;
      if (!id) return;
      const r = await fetch(`${apiBase()}/repos/${id}/tree`, {
        headers: { Authorization: `Bearer ${getBearerToken()}` },
      });
      if (r.status === 404) {
        clearStaleRepo();
        return;
      }
      if (!r.ok) return;
      const j = await r.json();
      setTree(j.tree);
    },
    [repoId, getBearerToken, clearStaleRepo]
  );

  return {
    repoId,
    setRepoId,
    meta,
    tree,
    setTree,
    connect,
    loadTree,
    token,
    setApiToken,
    getBearerToken,
    apiBase,
    repoUrl,
    setRepoUrl,
    clearStaleRepo,
  };
}
