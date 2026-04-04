import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, MessageSquare } from "lucide-react";
import type { Reference } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  references?: Reference[];
  streaming?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (question: string) => void;
  onReferenceClick: (file: string, line: number) => void;
  isStreaming: boolean;
  isConnected: boolean;
}

export type { ChatMessage };

export function ChatPanel({ messages, onSend, onReferenceClick, isStreaming, isConnected }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput("");
    onSend(q);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-medium border-b border-[hsl(var(--ide-border))] bg-[hsl(var(--ide-bg))] flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center mt-8">
            {isConnected
              ? "Ask a question about the codebase…"
              : "Connect a repo to start asking questions"}
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("text-xs leading-relaxed", msg.role === "user" ? "text-[hsl(var(--ide-text-bright))]" : "text-[hsl(var(--ide-text))]")}>
            <div className="font-medium text-[10px] uppercase tracking-wider mb-1 text-muted-foreground">
              {msg.role === "user" ? "You" : "AI"}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>
            {msg.streaming && (
              <span className="inline-block w-1.5 h-3 bg-[hsl(var(--primary))] animate-pulse ml-0.5" />
            )}
            {msg.references && msg.references.length > 0 && (
              <div className="mt-2 space-y-1">
                {msg.references.map((ref, i) => (
                  <button
                    key={i}
                    className="block text-[hsl(var(--primary))] hover:underline text-[11px]"
                    onClick={() => onReferenceClick(ref.file, ref.line)}
                  >
                    {ref.file}:{ref.line}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-[hsl(var(--ide-border))]">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            className="h-8 text-xs bg-secondary border-none flex-1"
            placeholder={isConnected ? "Ask about the code…" : "Connect a repo first"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isConnected || isStreaming}
          />
          <Button size="sm" className="h-8 w-8 p-0" type="submit" disabled={!isConnected || isStreaming || !input.trim()}>
            {isStreaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
