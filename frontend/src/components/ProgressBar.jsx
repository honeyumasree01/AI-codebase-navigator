export default function ProgressBar({ pct, label }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ height: 6, background: "#222", borderRadius: 3 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, pct)}%`,
            background: "#3b82f6",
            borderRadius: 3,
            transition: "width 0.2s",
          }}
        />
      </div>
    </div>
  );
}
