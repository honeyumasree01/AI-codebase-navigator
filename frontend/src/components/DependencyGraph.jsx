import * as d3 from "d3";
import { useEffect, useRef } from "react";

export default function DependencyGraph({ open, onClose, center, edges, onPick }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    if (!edges?.length) {
      const svg = d3.select(ref.current);
      svg.selectAll("*").remove();
      svg.append("text").attr("x", 20).attr("y", 24).attr("fill", "#888").text("no import edges");
      return;
    }
    const w = 560;
    const h = 400;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const g = svg.append("g");
    const zoom = d3.zoom().on("zoom", (ev) => g.attr("transform", ev.transform));
    svg.call(zoom);
    const nodes = Array.from(new Set(edges.flatMap((e) => [e.source, e.target]))).map((id) => ({
      id,
    }));
    const links = edges.map((e) => ({ source: e.source, target: e.target }));
    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3.forceLink(links).id((d) => d.id).distance(80)
      )
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(w / 2, h / 2));
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#555");
    const node = g
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 6)
      .attr("fill", (d) => (d.id === center ? "#3b82f6" : "#888"))
      .call(dragHandler(sim))
      .on("click", (_, d) => onPick?.(d.id));
    const lbl = g
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.id.split("/").pop())
      .attr("font-size", 10)
      .attr("fill", "#ccc")
      .attr("dx", 10)
      .attr("dy", 4);
    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      lbl.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });
    return () => sim.stop();
  }, [open, edges, center, onPick]);

  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: "#1a1a1a", padding: 12, borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <strong>Imports (v1)</strong>
          <button type="button" onClick={onClose}>
            close
          </button>
        </div>
        <svg ref={ref} width={560} height={400} style={{ background: "#0f1115" }} />
      </div>
    </div>
  );
}

function dragHandler(simulation) {
  return d3
    .drag()
    .on("start", (ev, d) => {
      if (!ev.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (ev, d) => {
      d.fx = ev.x;
      d.fy = ev.y;
    })
    .on("end", (ev, d) => {
      if (!ev.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
}
