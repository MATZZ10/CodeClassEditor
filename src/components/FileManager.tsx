"use client";

import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { getChildren, type VfsNode } from "@/lib/vfs";

type FileManagerProps = {
  nodes: VfsNode[];
  selectedId: string | null;
  currentParentId: string;
  expandedFolders: Record<string, boolean>;
  onSelectNode: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onNewFile: (parentId: string) => void;
  onNewFolder: (parentId: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

type BranchProps = {
  nodes: VfsNode[];
  parentId: string | null;
  depth: number;
  selectedId: string | null;
  expandedFolders: Record<string, boolean>;
  onSelectNode: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onNewFile: (parentId: string) => void;
  onNewFolder: (parentId: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

function Branch({
  nodes,
  parentId,
  depth,
  selectedId,
  expandedFolders,
  onSelectNode,
  onToggleFolder,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: BranchProps) {
  const children = getChildren(nodes, parentId);

  if (children.length === 0) {
    return depth === 0 ? (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-500">
        Belum ada file.
      </div>
    ) : (
      <div className="pl-5 text-xs text-zinc-500">Kosong</div>
    );
  }

  return (
    <div className="space-y-1.5">
      {children.map((node) => {
        const isFolder = node.type === "folder";
        const expanded = Boolean(expandedFolders[node.id]);
        const selected = selectedId === node.id;

        return (
          <div key={node.id} className="select-none">
            <div
              className={[
                "group flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-all",
                selected
                  ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-100 shadow-[0_0_0_1px_rgba(99,102,241,0.12)]"
                  : "border-zinc-800 bg-zinc-950/90 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900",
              ].join(" ")}
              style={{ marginLeft: depth * 12 }}
            >
              <button
                type="button"
                onClick={() =>
                  isFolder ? onToggleFolder(node.id) : onSelectNode(node.id)
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {isFolder ? (
                  expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                  )
                ) : (
                  <FileCode2 className="h-4 w-4 shrink-0 text-sky-400" />
                )}

                {isFolder && (
                  <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                )}

                <span className="truncate">{node.name}</span>
              </button>

              <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                {isFolder && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewFile(node.id);
                      }}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 transition hover:bg-zinc-800"
                      title="File baru"
                    >
                      <FilePlus2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewFolder(node.id);
                      }}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 transition hover:bg-zinc-800"
                      title="Folder baru"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(node.id);
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 transition hover:bg-zinc-800"
                  title="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                {node.parentId !== null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(node.id);
                    }}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 transition hover:bg-zinc-800"
                    title="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {isFolder && expanded && (
              <div className="mt-1.5">
                <Branch
                  nodes={nodes}
                  parentId={node.id}
                  depth={depth + 1}
                  selectedId={selectedId}
                  expandedFolders={expandedFolders}
                  onSelectNode={onSelectNode}
                  onToggleFolder={onToggleFolder}
                  onNewFile={onNewFile}
                  onNewFolder={onNewFolder}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FileManager({
  nodes,
  selectedId,
  currentParentId,
  expandedFolders,
  onSelectNode,
  onToggleFolder,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: FileManagerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100">File Manager</h2>
          <p className="text-xs text-zinc-400">
            Workspace tersimpan lokal per browser / per orang.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onNewFile(currentParentId)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 transition hover:bg-zinc-800"
          >
            <FilePlus2 className="h-4 w-4" />
            <span className="hidden sm:inline">New File</span>
            <span className="sm:hidden">File</span>
          </button>

          <button
            type="button"
            onClick={() => onNewFolder(currentParentId)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 transition hover:bg-zinc-800"
          >
            <FolderPlus className="h-4 w-4" />
            <span className="hidden sm:inline">New Folder</span>
            <span className="sm:hidden">Folder</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950/60 p-2.5">
        <Branch
          nodes={nodes}
          parentId={null}
          depth={0}
          selectedId={selectedId}
          expandedFolders={expandedFolders}
          onSelectNode={onSelectNode}
          onToggleFolder={onToggleFolder}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}