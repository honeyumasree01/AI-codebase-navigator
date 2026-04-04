import { useState } from "react";

function Node({ name, sub, path, onPick, refs }) {
  const [open, setOpen] = useState(true);
  const full = path ? `${path}/${name}` : name;
  const amber = refs && refs.has(full);
  if (sub === null || sub === undefined) {
    return (
      <div
        onClick={() => onPick(full)}
        style={{
          paddingLeft: 8,
          cursor: "pointer",
          color: amber ? "#fbbf24" : "#ccc",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {name}
      </div>
    );
  }
  const keys = Object.keys(sub);
  return (
    <div style={{ marginLeft: 6 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#9ca3af" }}
      >
        {open ? "▼" : "▶"} {name}
      </div>
      {open &&
        keys.map((k) => (
          <Node
            key={k}
            name={k}
            sub={sub[k]}
            path={full}
            onPick={onPick}
            refs={refs}
          />
        ))}
    </div>
  );
}

export default function FileTree({ tree, onPick, refs }) {
  if (!tree || typeof tree !== "object")
    return <div style={{ opacity: 0.5, padding: 8 }}>no tree</div>;
  const setr = refs ? new Set(refs.map((r) => r.replace(/^\.\//, ""))) : null;
  return (
    <div style={{ overflow: "auto", maxHeight: "100%" }}>
      {Object.keys(tree).map((k) => (
        <Node key={k} name={k} sub={tree[k]} path="" onPick={onPick} refs={setr} />
      ))}
    </div>
  );
}
