import { useState } from "react";

const mono = { fontFamily: '"Courier New", Courier, monospace' };

function Node({ name, sub, path, onPick, refs }) {
  const [open, setOpen] = useState(true);
  const full = path ? `${path}/${name}` : name;
  const amber = refs && refs.has(full);
  if (sub === null || sub === undefined) {
    return (
      <div
        onClick={() => onPick(full)}
        style={{
          paddingLeft: 6,
          paddingRight: 4,
          cursor: "pointer",
          color: amber ? "#fbbf24" : "#9d9d9d",
          fontSize: 11,
          lineHeight: 1.5,
          ...mono,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={full}
      >
        {name}
      </div>
    );
  }
  const keys = Object.keys(sub);
  return (
    <div style={{ marginLeft: 4 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#666", ...mono }}
      >
        {open ? "▼" : "▶"} {name}
      </div>
      {open &&
        keys.map((k) => (
          <Node key={k} name={k} sub={sub[k]} path={full} onPick={onPick} refs={refs} />
        ))}
    </div>
  );
}

export default function FileTree({ tree, onPick, refs }) {
  if (!tree || typeof tree !== "object")
    return (
      <div style={{ opacity: 0.45, padding: 8, fontSize: 11, ...mono }}>
        no tree
      </div>
    );
  const setr = refs ? new Set(refs.map((r) => r.replace(/^\.\//, ""))) : null;
  return (
    <div style={{ overflow: "auto", maxHeight: "100%", paddingRight: 4 }}>
      {Object.keys(tree).map((k) => (
        <Node key={k} name={k} sub={tree[k]} path="" onPick={onPick} refs={setr} />
      ))}
    </div>
  );
}
