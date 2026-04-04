import { describe, expect, it } from "vitest";
import { createSSEParser } from "./api";

function collectBlocks(feeds: string[]): Array<{ event: string; data: string }> {
  const out: Array<{ event: string; data: string }> = [];
  const sse = createSSEParser((eventName, data) => {
    out.push({ event: eventName, data });
  });
  for (const f of feeds) {
    sse.feed(f);
  }
  sse.end();
  return out;
}

describe("createSSEParser", () => {
  it("parses LF-separated blocks (backend curl shape)", () => {
    const raw =
      "event: token\ndata: Hi \n\n" +
      "event: complete\ndata: " +
      '{"answer":"ok","references":[]}\n\n';
    const blocks = collectBlocks([raw]);
    expect(blocks.map((b) => b.event)).toEqual(["token", "complete"]);
    expect(blocks[0].data).toBe("Hi ");
    expect(JSON.parse(blocks[1].data)).toEqual({ answer: "ok", references: [] });
  });

  it("parses CRLF — blank line is \\r\\n\\r\\n, not \\n\\n", () => {
    const raw =
      "event: token\r\ndata: x\r\n\r\n" +
      'event: complete\r\ndata: {"answer":"y","references":[]}\r\n\r\n';
    const blocks = collectBlocks([raw]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].event).toBe("complete");
    expect(JSON.parse(blocks[1].data).answer).toBe("y");
  });

  it("handles chunks split mid-line and mid-block", () => {
    const blocks = collectBlocks([
      "event: tok",
      "en\ndata: part",
      "\n\n",
      "event: complete\ndata: ",
      '{"answer":"z","references":[]}',
      "\n\n",
    ]);
    expect(blocks.map((b) => [b.event, b.data])).toEqual([
      ["token", "part"],
      ["complete", '{"answer":"z","references":[]}'],
    ]);
  });

  it("flushes final complete block without trailing blank line on end()", () => {
    const blocks = collectBlocks(['event: complete\ndata: {"answer":"eof","references":[]}']);
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0].data).answer).toBe("eof");
  });

  it("emits error event", () => {
    const blocks = collectBlocks(["event: error\ndata: boom\n\n"]);
    expect(blocks).toEqual([{ event: "error", data: "boom" }]);
  });

  it("joins multiple data: lines with newline", () => {
    const blocks = collectBlocks(["event: message\ndata: a\ndata: b\n\n"]);
    expect(blocks[0].data).toBe("a\nb");
  });
});
