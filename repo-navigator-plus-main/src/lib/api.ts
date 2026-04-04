const DEFAULT_BASE_URL = "http://localhost:8000";

export function getBaseUrl(custom?: string): string {
  return (custom || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function normalizeToken(token: string): string {
  let t = token.trim();
  while (/^Bearer\s+/i.test(t)) {
    t = t.replace(/^Bearer\s+/i, "").trim();
  }
  return t;
}

function authJson(token: string) {
  return {
    Authorization: `Bearer ${normalizeToken(token)}`,
    "Content-Type": "application/json",
  };
}

function authBearer(token: string) {
  return {
    Authorization: `Bearer ${normalizeToken(token)}`,
  };
}

export interface ConnectResult {
  repo_id: string;
  already_indexed: boolean;
}

export async function connectRepo(
  baseUrl: string,
  token: string,
  githubUrl: string
): Promise<ConnectResult> {
  const res = await fetch(`${getBaseUrl(baseUrl)}/repos`, {
    method: "POST",
    headers: authJson(token),
    body: JSON.stringify({ github_url: githubUrl }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Connect failed: ${res.status}`);
  }
  return res.json();
}

export interface RepoStatus {
  status: string;
  name?: string | null;
  file_count?: number | null;
  chunk_count?: number | null;
}

export async function pollRepoStatus(
  baseUrl: string,
  token: string,
  repoId: string
): Promise<RepoStatus> {
  const res = await fetch(`${getBaseUrl(baseUrl)}/repos/${repoId}`, {
    headers: authBearer(token),
  });
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

function treeObjectToNodes(obj: Record<string, unknown> | null | undefined, prefix: string): TreeNode[] {
  if (!obj || typeof obj !== "object") return [];
  const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  const out: TreeNode[] = [];
  for (const [name, val] of entries) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (val === null || val === undefined) {
      out.push({ name, path, type: "file" });
    } else if (typeof val === "object") {
      const children = treeObjectToNodes(val as Record<string, unknown>, path);
      out.push({ name, path, type: "directory", children });
    }
  }
  return out;
}

export async function loadFileTree(
  baseUrl: string,
  token: string,
  repoId: string
): Promise<TreeNode[]> {
  const res = await fetch(`${getBaseUrl(baseUrl)}/repos/${repoId}/tree`, {
    headers: authBearer(token),
  });
  if (!res.ok) throw new Error(`Tree load failed: ${res.status}`);
  const data: { tree?: Record<string, unknown> } = await res.json();
  return treeObjectToNodes(data.tree ?? {}, "");
}

export async function getFileContent(
  baseUrl: string,
  token: string,
  repoId: string,
  path: string
): Promise<string> {
  const res = await fetch(
    `${getBaseUrl(baseUrl)}/repos/${repoId}/file?path=${encodeURIComponent(path)}`,
    { headers: authBearer(token) }
  );
  if (!res.ok) throw new Error(`File load failed: ${res.status}`);
  const data: {
    lines?: Array<{ n?: number; text?: string }>;
    content?: string;
  } = await res.json();
  if (data.lines && Array.isArray(data.lines)) {
    return data.lines.map((l) => (l.text ?? "").replace(/\n$/, "")).join("\n");
  }
  if (typeof data.content === "string") return data.content;
  return "";
}

export interface Reference {
  file: string;
  line: number;
  snippet?: string;
}

export interface QueryResult {
  answer: string;
  references: Reference[];
}

/**
 * Incremental SSE parser: blocks are separated by a blank line (\\n\\n or \\r\\n\\r\\n).
 * Handles CRLF, multiple `data:` lines, and chunks that split mid-line or mid-block.
 */
export function createSSEParser(onBlock: (eventName: string, data: string) => void) {
  let lineCarry = "";
  let blockLines: string[] = [];

  function parseFieldLine(line: string): { field: string; value: string } | null {
    const idx = line.indexOf(":");
    if (idx < 0) return null;
    const field = line.slice(0, idx).trim();
    let value = line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    return { field, value };
  }

  function flushBlock() {
    if (blockLines.length === 0) return;
    let eventName = "message";
    const dataParts: string[] = [];
    for (const raw of blockLines) {
      const line = raw.replace(/\r$/, "");
      const parsed = parseFieldLine(line);
      if (!parsed) continue;
      if (parsed.field === "event") {
        eventName = parsed.value.trim();
      } else if (parsed.field === "data") {
        dataParts.push(parsed.value);
      }
    }
    blockLines = [];
    const data = dataParts.join("\n");
    if (data.length > 0) onBlock(eventName, data);
  }

  /** Push decoded text; splits on \\n and emits blocks on blank lines. */
  function feed(chunk: string) {
    lineCarry += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (;;) {
      const nl = lineCarry.indexOf("\n");
      if (nl < 0) break;
      const line = lineCarry.slice(0, nl);
      lineCarry = lineCarry.slice(nl + 1);
      if (line === "") {
        flushBlock();
      } else {
        blockLines.push(line);
      }
    }
  }

  /** Call when the byte stream ends: flush last line and any block without trailing blank line. */
  function end() {
    if (lineCarry.length > 0) {
      blockLines.push(lineCarry);
      lineCarry = "";
    }
    flushBlock();
  }

  return { feed, end };
}

function resultTextFromPayload(p: Record<string, unknown>): string {
  const a = p.answer ?? p.summary ?? p.explanation;
  if (typeof a === "string" && a) return a;
  return JSON.stringify(p);
}

export function streamQuery(
  baseUrl: string,
  token: string,
  repoId: string,
  question: string,
  queryType: "location" | "impact" | "explain" | "flow",
  onToken: (chunk: string) => void,
  onComplete: (result: QueryResult) => void,
  onError: (error: Error) => void
): () => void {
  const controller = new AbortController();
  let settled = false;

  const finish = (kind: "complete" | "error", payload: QueryResult | Error) => {
    if (settled) return;
    settled = true;
    if (kind === "complete") onComplete(payload as QueryResult);
    else onError(payload as Error);
  };

  void (async () => {
    try {
      const res = await fetch(`${getBaseUrl(baseUrl)}/repos/${repoId}/query`, {
        method: "POST",
        headers: {
          ...authJson(token),
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ question, query_type: queryType }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Query failed: ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const dispatch = (ev: string, data: string) => {
        if (ev === "token") {
          if (!settled) onToken(data);
          return;
        }
        if (ev === "complete") {
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            const refsRaw = parsed.references;
            const references: Reference[] = Array.isArray(refsRaw)
              ? refsRaw.map((r: unknown) => {
                  const o = r as Record<string, unknown>;
                  return {
                    file: String(o.file ?? ""),
                    line: Number(o.line ?? 0),
                    snippet: o.snippet != null ? String(o.snippet) : undefined,
                  };
                })
              : [];
            finish("complete", {
              answer: resultTextFromPayload(parsed),
              references,
            });
          } catch {
            finish("error", new Error("Invalid response payload"));
          }
          return;
        }
        if (ev === "error") {
          finish("error", new Error(data));
        }
      };

      const sse = createSSEParser(dispatch);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sse.feed(decoder.decode(value, { stream: true }));
      }
      sse.end();

      if (!settled) {
        finish("error", new Error("Stream ended before a complete event"));
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === "AbortError") return;
      finish("error", e instanceof Error ? e : new Error(String(err)));
    }
  })();

  return () => controller.abort();
}
