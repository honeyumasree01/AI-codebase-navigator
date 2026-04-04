import { useState, useCallback, useRef, useEffect } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { TopBar } from "@/components/TopBar";
import { FileTree } from "@/components/FileTree";
import { CodeViewer } from "@/components/CodeViewer";
import { ChatPanel, type ChatMessage } from "@/components/ChatPanel";
import {
  connectRepo,
  pollRepoStatus,
  loadFileTree,
  getFileContent,
  streamQuery,
  type Reference,
  type TreeNode,
} from "@/lib/api";

const POLL_MS = 3000;

const Index = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedRepo, setConnectedRepo] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [highlightedFiles, setHighlightedFiles] = useState<Set<string>>(new Set());
  const [highlightedLines, setHighlightedLines] = useState<Set<number>>(new Set());
  const [scrollToLine, setScrollToLine] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const apiConfigRef = useRef({ baseUrl: "", token: "" });
  /** Sync guard — `isStreaming` updates async; block duplicate POSTs here. */
  const queryInFlightRef = useRef(false);
  const abortFetchRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      abortFetchRef.current?.();
      abortFetchRef.current = null;
      queryInFlightRef.current = false;
    },
    []
  );

  const loadTreeForRepo = useCallback(
    async (baseUrl: string, token: string, rid: string, repoLabel: string) => {
      const treeData = await loadFileTree(baseUrl, token, rid);
      setTree(treeData);
      setConnectedRepo(repoLabel);
      setStatusMessage(null);
    },
    []
  );

  const handleConnect = useCallback(
    async (repoUrl: string, token: string, baseUrl: string) => {
      setIsConnecting(true);
      setStatusMessage("Connecting…");
      setConnectedRepo(null);
      setTree([]);
      apiConfigRef.current = { baseUrl, token };

      try {
        const { repo_id, already_indexed } = await connectRepo(baseUrl, token, repoUrl);
        setRepoId(repo_id);

        const repoLabel =
          repoUrl
            .replace(/\.git\/?$/, "")
            .split("/")
            .slice(-2)
            .join("/") || repo_id;

        if (already_indexed) {
          setStatusMessage("Repository ready — loading tree…");
          await loadTreeForRepo(baseUrl, token, repo_id, repoLabel);
          return;
        }

        setStatusMessage("Indexing repository…");
        for (;;) {
          const st = await pollRepoStatus(baseUrl, token, repo_id);
          const fc = st.file_count ?? 0;
          const nm = st.name || "";
          setStatusMessage(
            `Indexing${nm ? ` · ${nm}` : ""}${fc ? ` · ${fc} files` : ""}…`
          );

          if (st.status === "complete") break;
          if (st.status === "failed") {
            throw new Error("Indexing failed. Check the API logs or try again.");
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }

        setStatusMessage("Loading file tree…");
        await loadTreeForRepo(baseUrl, token, repo_id, repoLabel);
      } catch (err: unknown) {
        setStatusMessage(`Error: ${(err as Error).message}`);
        setConnectedRepo(null);
        setTree([]);
      } finally {
        setIsConnecting(false);
      }
    },
    [loadTreeForRepo]
  );

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!repoId) return;
      setSelectedFile(path);
      setHighlightedLines(new Set());
      setScrollToLine(undefined);
      try {
        const content = await getFileContent(
          apiConfigRef.current.baseUrl,
          apiConfigRef.current.token,
          repoId,
          path
        );
        setFileContent(content);
      } catch {
        setFileContent("// Failed to load file");
      }
    },
    [repoId]
  );

  const handleReferenceClick = useCallback(
    async (file: string, line: number) => {
      if (!repoId) return;
      setSelectedFile(file);
      setHighlightedLines(new Set([line]));
      setScrollToLine(line);
      try {
        const content = await getFileContent(
          apiConfigRef.current.baseUrl,
          apiConfigRef.current.token,
          repoId,
          file
        );
        setFileContent(content);
      } catch {
        setFileContent("// Failed to load file");
      }
    },
    [repoId]
  );

  const releaseQuery = useCallback(() => {
    queryInFlightRef.current = false;
    abortFetchRef.current = null;
    setIsStreaming(false);
  }, []);

  const handleSend = useCallback(
    (question: string) => {
      if (!repoId?.trim() || queryInFlightRef.current) return;

      queryInFlightRef.current = true;
      setIsStreaming(true);

      const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: "user", content: question };
      const assistantId = `${Date.now()}-a`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      abortFetchRef.current?.();
      abortFetchRef.current = null;

      const abortFetch = streamQuery(
        apiConfigRef.current.baseUrl,
        apiConfigRef.current.token,
        repoId,
        question,
        "location",
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
          );
        },
        (result) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: result.answer || m.content,
                    references: result.references,
                    streaming: false,
                  }
                : m
            )
          );
          releaseQuery();
          if (result.references?.length) {
            setHighlightedFiles(new Set(result.references.map((r: Reference) => r.file)));
          }
        },
        (error) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `Error: ${error.message}`, streaming: false } : m
            )
          );
          releaseQuery();
        }
      );

      abortFetchRef.current = abortFetch;
    },
    [repoId, releaseQuery]
  );

  return (
    <div className="flex flex-col h-screen bg-[hsl(var(--ide-bg))]">
      <TopBar
        onConnect={handleConnect}
        isConnecting={isConnecting}
        connectedRepo={connectedRepo}
        statusMessage={statusMessage}
      />
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={12}>
          <div className="h-full bg-[hsl(var(--ide-panel))] border-r border-[hsl(var(--ide-border))]">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-[hsl(var(--ide-border))] uppercase tracking-wider">
              Explorer
            </div>
            <FileTree
              tree={tree}
              onFileSelect={handleFileSelect}
              highlightedFiles={highlightedFiles}
              selectedFile={selectedFile}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} minSize={25}>
          <div className="h-full bg-[hsl(var(--ide-bg))]">
            <CodeViewer
              filePath={selectedFile}
              content={fileContent}
              highlightedLines={highlightedLines}
              scrollToLine={scrollToLine}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={18}>
          <div className="h-full bg-[hsl(var(--ide-panel))] border-l border-[hsl(var(--ide-border))]">
            <ChatPanel
              messages={messages}
              onSend={handleSend}
              onReferenceClick={handleReferenceClick}
              isStreaming={isStreaming}
              isConnected={!!connectedRepo}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default Index;
