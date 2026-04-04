import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import type { TreeNode } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  tree: TreeNode[];
  onFileSelect: (path: string) => void;
  highlightedFiles: Set<string>;
  selectedFile: string | null;
}

function TreeItem({
  node,
  depth,
  onFileSelect,
  highlightedFiles,
  selectedFile,
}: {
  node: TreeNode;
  depth: number;
  onFileSelect: (path: string) => void;
  highlightedFiles: Set<string>;
  selectedFile: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isHighlighted = highlightedFiles.has(node.path);
  const isSelected = selectedFile === node.path;

  return (
    <div>
      <button
        className={cn(
          "flex items-center gap-1 w-full text-left py-0.5 px-1 text-xs hover:bg-accent/50 rounded-sm transition-colors",
          isHighlighted && "text-[hsl(var(--ide-highlight-amber))]",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (isDir) setOpen(!open);
          else onFileSelect(node.path);
        }}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <File className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {isDir && <Folder className="h-3 w-3 shrink-0 text-[hsl(var(--primary))]" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open && node.children?.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          highlightedFiles={highlightedFiles}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
}

export function FileTree({ tree, onFileSelect, highlightedFiles, selectedFile }: FileTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Connect a repo to browse files
      </div>
    );
  }

  return (
    <div className="py-1 overflow-auto h-full">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          onFileSelect={onFileSelect}
          highlightedFiles={highlightedFiles}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
}
