import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Link, Key, Server } from "lucide-react";

interface TopBarProps {
  onConnect: (repoUrl: string, token: string, baseUrl: string) => void;
  isConnecting: boolean;
  connectedRepo: string | null;
  statusMessage: string | null;
}

export function TopBar({ onConnect, isConnecting, connectedRepo, statusMessage }: TopBarProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000");

  return (
    <>
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-[hsl(var(--ide-bg))] border-[hsl(var(--ide-border))]">
      <div className="flex items-center gap-2 flex-1">
        <Server className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          className="h-8 text-xs max-w-[180px] bg-secondary border-none"
          placeholder="API Base URL"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <Link className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          className="h-8 text-xs flex-1 bg-secondary border-none"
          placeholder="https://github.com/user/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
        />
        <Key className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          className="h-8 text-xs max-w-[200px] bg-secondary border-none"
          type="password"
          placeholder="API Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => onConnect(repoUrl, token, baseUrl)}
          disabled={isConnecting || !repoUrl || !token}
        >
          {isConnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Connect
        </Button>
      </div>

      {connectedRepo && (
        <div className="flex items-center gap-2 text-xs shrink-0">
          <div className="h-2 w-2 rounded-full bg-[hsl(var(--ide-success))]" />
          <span className="text-[hsl(var(--ide-success))]">Connected: {connectedRepo}</span>
        </div>
      )}
      {statusMessage && !connectedRepo && (
        <span className="text-xs text-muted-foreground shrink-0 max-w-[40%] truncate" title={statusMessage}>
          {statusMessage}
        </span>
      )}
    </div>
    {isConnecting && (
      <div className="px-4 pb-2 border-b bg-[hsl(var(--ide-bg))] border-[hsl(var(--ide-border))]">
        <Progress value={66} className="h-1" />
      </div>
    )}
    </>
  );
}
