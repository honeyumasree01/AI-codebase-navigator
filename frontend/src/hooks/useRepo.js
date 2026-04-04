import { useCallback, useRef, useState } from "react";

const apiBase = () => import.meta.env.VITE_API_URL || "";

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

function readInitialToken() {
  let stored = "";
  try {
    const s = localStorage.getItem(LS_TOKEN);
    if (s !== null) stored = s;
  } catch {
    void 0;
  }
  const fromEnv = import.meta.env.VITE_API_TOKEN || "";
  const raw = stored || fromEnv;
  const normalized = normalizeRawToken(raw);
  if (stored && normalized !== stored) {
    try {
      if (normalized) localStorage.setItem(LS_TOKEN, normalized);
      else localStorage.removeItem(LS_TOKEN);
    } catch {
      void 0;
    }
  }
  return normalized;
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

const _bootToken = readInitialToken();

export function useRepo() {
  const [repoId, setRepoId] = useState(readInitialRepoId);
  const [meta, setMeta] = useState({ status: "", files: 0, chunks: 0, name: "" });
  const [tree, setTree] = useState(null);
  const [token, setToken] = useState(() => _bootToken);
  /** Always up to date for fetch(); updated in setApiToken before setState. */
  const tokenRef = useRef(_bootToken);
  const [repoUrl, setRepoUrlState] = useState(readInitialRepoUrl);

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

  const getBearerToken = useCallback(
    () => normalizeRawToken(tokenRef.current),
    []
  );

  const connect = useCallback(
    async (githubUrl) => {
      const auth = normalizeRawToken(tokenRef.current);
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
    [setRepoUrl]
  );

  const loadTree = useCallback(
    async (overrideId) => {
      const id = overrideId ?? repoId;
      if (!id) return;
      const r = await fetch(`${apiBase()}/repos/${id}/tree`, {
        headers: { Authorization: `Bearer ${getBearerToken()}` },
      });
      if (!r.ok) return;
      const j = await r.json();
      setTree(j.tree);
    },
    [repoId, getBearerToken]
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
  };
}
