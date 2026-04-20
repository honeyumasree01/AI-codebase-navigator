/** @param {string | (() => string)} tokenOrGetter */
function resolveBearer(tokenOrGetter) {
  const raw =
    typeof tokenOrGetter === "function" ? tokenOrGetter() : tokenOrGetter;
  return typeof raw === "string" ? raw.trim() : "";
}

function assertBearer(token) {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) {
    throw new Error("API token is required (set VITE_API_TOKEN or the token field in the header).");
  }
}

function assertQueryUrl(url) {
  if (!url || typeof url !== "string") {
    throw new Error("Query URL is missing.");
  }
  if (url.includes("/repos//")) {
    throw new Error("Query URL is missing repo id — connect a repository first.");
  }
}

async function readEventStream(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const separator = /\r?\n\r?\n/;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let match;
    while ((match = separator.exec(buf)) !== null) {
      const i = match.index;
      const block = buf.slice(0, i);
      buf = buf.slice(i + match[0].length);
      let ev = "message";
      const dataLines = [];
      for (const ln of block.split(/\r?\n/)) {
        if (ln.startsWith("event:")) ev = ln.slice(6).trim();
        if (ln.startsWith("data:")) {
          let chunk = ln.slice(5);
          // SSE allows one optional leading space after "data:".
          if (chunk.startsWith(" ")) chunk = chunk.slice(1);
          dataLines.push(chunk);
        }
      }
      const data = dataLines.join("\n");
      if (data) onEvent(ev, data);
    }
  }
}

export async function getSSE(url, tokenOrGetter, onEvent) {
  const token = resolveBearer(tokenOrGetter);
  assertBearer(token);
  const res = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  await readEventStream(res, onEvent);
}

export async function postQueryStream(url, tokenOrGetter, body, onEvent) {
  const token = resolveBearer(tokenOrGetter);
  assertBearer(token);
  assertQueryUrl(url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  await readEventStream(res, onEvent);
}
