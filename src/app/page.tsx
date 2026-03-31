"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
  LogOut,
  Menu,
  Play,
  Plus,
  RefreshCw,
  Square,
  TerminalSquare,
  Trash2,
  X,
  Code2,
  Send,
} from "lucide-react";

import CodeEditor from "@/components/CodeEditor";
import AuthPanel from "@/components/AuthPanel";
import type { PublicUser } from "@/lib/authStore";

type VfsNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  content?: string;
  children?: VfsNode[];
};

type TerminalLog = {
  type: "sys" | "in" | "out" | "error";
  msg: string;
  timestamp: Date;
};

type EngineHealthResponse = {
  ok: boolean;
  status: "connected" | "disconnected" | "error";
  selectedEngine: "piston" | "cpp-runner" | null;
  available?: {
    piston?: { online: boolean; baseUrl?: string | null };
    cppRunner?: { online: boolean; baseUrl?: string | null };
  };
  message?: string;
  error?: string;
};

const ROOT_FOLDER_ID = "root-folder";

function createId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function createInitialWorkspace(): VfsNode[] {
  return [
    {
      id: ROOT_FOLDER_ID,
      name: "my-project",
      type: "folder",
      children: [
        {
          id: createId("file"),
          name: "main.cpp",
          type: "file",
          content: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;

    cout << "╔════════════════════════════════╗" << endl;
    cout << "║   Welcome to Code Studio!      ║" << endl;
    cout << "╚════════════════════════════════╝" << endl;
    cout << "\\nEnter your name: ";

    getline(cin, name);

    cout << "\\nHello, " << name << "!" << endl;
    cout << "This is a C++ program running in the cloud." << endl;
    cout << "You can now write and execute C++ code interactively.\\n" << endl;

    return 0;
}
`,
        },
      ],
    },
  ];
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getRootNode(nodes: VfsNode[]) {
  return nodes.find((node) => node.id === ROOT_FOLDER_ID) ?? nodes[0] ?? null;
}

function findFirstFileId(nodes: VfsNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file") return node.id;
    if (node.children?.length) {
      const found = findFirstFileId(node.children);
      if (found) return found;
    }
  }
  return null;
}

function findNodeById(nodes: VfsNode[], id: string): VfsNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeById(
  nodes: VfsNode[],
  id: string,
  updater: (node: VfsNode) => VfsNode
): VfsNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    if (node.children?.length) {
      return { ...node, children: updateNodeById(node.children, id, updater) };
    }
    return node;
  });
}

function removeNodeById(nodes: VfsNode[], id: string): VfsNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: node.children ? removeNodeById(node.children, id) : undefined,
    }));
}

function flattenFiles(
  nodes: VfsNode[],
  parentPath = ""
): Array<{ name: string; content: string }> {
  const output: Array<{ name: string; content: string }> = [];

  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

    if (node.type === "file") {
      output.push({ name: currentPath, content: node.content ?? "" });
    }

    if (node.type === "folder" && node.children?.length) {
      output.push(...flattenFiles(node.children, currentPath));
    }
  }

  return output;
}

function getAllFolderIds(nodes: VfsNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") ids.push(node.id);
    if (node.children?.length) {
      ids.push(...getAllFolderIds(node.children));
    }
  }
  return ids;
}

// Snippets C++
const SNIPPETS = [
  { name: "Hello World", code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}' },
  { name: "For Loop", code: 'for (int i = 0; i < n; i++) {\n    // your code here\n}' },
  { name: "While Loop", code: 'while (condition) {\n    // your code here\n}' },
  { name: "Function", code: 'int functionName(int param) {\n    // your code here\n    return 0;\n}' },
  { name: "Vector", code: '#include <vector>\nvector<int> vec = {1, 2, 3};' },
  { name: "String", code: '#include <string>\nstring str = "example";' },
  { name: "Class", code: 'class ClassName {\npublic:\n    ClassName() {}\n    ~ClassName() {}\nprivate:\n    // members\n};' },
  { name: "Template", code: 'template<typename T>\nT max(T a, T b) {\n    return (a > b) ? a : b;\n}' },
];

export default function Page() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [nodes, setNodes] = useState<VfsNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [activeFileId, setActiveFileId] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isAwaitingInput, setIsAwaitingInput] = useState(false);
  const [engineStatus, setEngineStatus] = useState<"online" | "offline" | "checking">("checking");
  const [engineName, setEngineName] = useState<string>("Mengecek engine...");
  const [engineMeta, setEngineMeta] = useState<EngineHealthResponse | null>(null);

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorContentRef = useRef<string>("");

  const workspaceKey = user ? `ccs:vfs:${user.id}` : "";
  const expandedKey = user ? `ccs:expanded:${user.id}` : "";

  // Auto-scroll
  useEffect(() => {
    if (shouldAutoScroll && terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs, shouldAutoScroll]);

  const handleTerminalScroll = () => {
    if (terminalContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = terminalContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      setShouldAutoScroll(isAtBottom);
    }
  };

  // Focus input saat awaiting input
  useEffect(() => {
    if (isAwaitingInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAwaitingInput]);

  // Load user
  useEffect(() => {
    const boot = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.ok) setUser(data.user as PublicUser);
        else setUser(null);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };
    boot();
  }, []);

  // Load workspace
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setNodes([]);
      setExpandedFolders({});
      setSelectedNodeId("");
      setActiveFileId("");
      return;
    }

    const savedNodes = localStorage.getItem(workspaceKey);
    const loadedNodes = savedNodes
      ? safeParse<VfsNode[]>(savedNodes, createInitialWorkspace())
      : createInitialWorkspace();

    setNodes(loadedNodes);
    setSelectedNodeId(getRootNode(loadedNodes)?.id ?? "");
    setActiveFileId(findFirstFileId(loadedNodes) ?? "");

    const savedExpanded = localStorage.getItem(expandedKey);
    const parsedExpanded = savedExpanded
      ? safeParse<Record<string, boolean>>(savedExpanded, {})
      : {};

    const folderIds = getAllFolderIds(loadedNodes);
    const defaultExpanded = Object.fromEntries(folderIds.map((id) => [id, true]));

    setExpandedFolders({ ...defaultExpanded, ...parsedExpanded });
  }, [user, authLoading, workspaceKey, expandedKey]);

  // Persist workspace
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(workspaceKey, JSON.stringify(nodes));
  }, [nodes, user, workspaceKey]);

  // Persist expanded folders
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(expandedKey, JSON.stringify(expandedFolders));
  }, [expandedFolders, user, expandedKey]);

  const activeFile = useMemo(() => {
    return activeFileId ? findNodeById(nodes, activeFileId) : null;
  }, [nodes, activeFileId]);

  useEffect(() => {
    if (activeFile?.type === "file") {
      editorContentRef.current = activeFile.content ?? "";
    }
  }, [activeFile]);

  // Check engine health
  useEffect(() => {
    const checkEngine = async () => {
      try {
        const res = await fetch("/api/execute", { method: "GET" });
        const data = (await res.json()) as EngineHealthResponse;
        setEngineStatus(data.ok ? "online" : "offline");
        setEngineMeta(data);
        setEngineName(
          data.ok
            ? data.selectedEngine === "piston"
              ? "Piston Online"
              : data.selectedEngine === "cpp-runner"
                ? "CPP Runner Online"
                : "Engine Aktif"
            : data.error || data.message || "Engine Offline"
        );
      } catch {
        setEngineStatus("offline");
        setEngineName("Gagal terhubung ke engine");
        setEngineMeta(null);
      }
    };
    if (user) checkEngine();
  }, [user]);

  const addTerminalLog = (type: TerminalLog["type"], msg: string) => {
    setTerminalLogs((prev) => [...prev, { type, msg, timestamp: new Date() }]);
  };

  const clearTerminal = () => {
    setTerminalLogs([]);
  };

  const updateActiveFileContent = (nextContent: string) => {
    if (!activeFileId) return;
    editorContentRef.current = nextContent;
    setNodes((prev) =>
      updateNodeById(prev, activeFileId, (node) => ({ ...node, content: nextContent }))
    );
  };

  const insertSnippet = (snippetCode: string) => {
    if (!activeFileId) {
      addTerminalLog("error", "Please select a file first");
      return;
    }
    const newContent = editorContentRef.current + "\n\n" + snippetCode;
    updateActiveFileContent(newContent);
    addTerminalLog("sys", `Snippet inserted: ${snippetCode.split("\n")[0]}...`);
  };

  const handleCreateFile = () => {
    const targetFolderId =
      selectedNodeId && findNodeById(nodes, selectedNodeId)?.type === "folder"
        ? selectedNodeId
        : ROOT_FOLDER_ID;

    const fileName = window.prompt("File name:", "newfile.cpp")?.trim();
    if (!fileName) return;

    const newFile: VfsNode = {
      id: createId("file"),
      name: fileName,
      type: "file",
      content: fileName.endsWith(".h")
        ? `#pragma once\n\n`
        : `#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n`,
    };

    setNodes((prev) =>
      updateNodeById(prev, targetFolderId, (node) => ({
        ...node,
        children: [...(node.children ?? []), newFile],
      }))
    );
    setExpandedFolders((prev) => ({ ...prev, [targetFolderId]: true }));
    setActiveFileId(newFile.id);
    setSelectedNodeId(newFile.id);
    setIsSidebarOpen(false);
  };

  const handleCreateFolder = () => {
    const targetFolderId =
      selectedNodeId && findNodeById(nodes, selectedNodeId)?.type === "folder"
        ? selectedNodeId
        : ROOT_FOLDER_ID;

    const folderName = window.prompt("Folder name:", "new-folder")?.trim();
    if (!folderName) return;

    const newFolder: VfsNode = {
      id: createId("folder"),
      name: folderName,
      type: "folder",
      children: [],
    };

    setNodes((prev) =>
      updateNodeById(prev, targetFolderId, (node) => ({
        ...node,
        children: [...(node.children ?? []), newFolder],
      }))
    );
    setExpandedFolders((prev) => ({
      ...prev,
      [targetFolderId]: true,
      [newFolder.id]: true,
    }));
    setSelectedNodeId(newFolder.id);
    setIsSidebarOpen(false);
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId || selectedNodeId === ROOT_FOLDER_ID) return;
    const target = findNodeById(nodes, selectedNodeId);
    if (!target) return;
    if (!window.confirm(`Delete "${target.name}"?`)) return;

    const nextNodes = removeNodeById(nodes, selectedNodeId);
    setNodes(nextNodes);
    setActiveFileId(findFirstFileId(nextNodes) ?? "");
    setSelectedNodeId(getRootNode(nextNodes)?.id ?? "");
    setIsSidebarOpen(false);
  };

  const handleRenameNode = () => {
    if (!selectedNodeId || selectedNodeId === ROOT_FOLDER_ID) return;
    const target = findNodeById(nodes, selectedNodeId);
    if (!target) return;

    const newName = window.prompt("New name:", target.name)?.trim();
    if (!newName || newName === target.name) return;

    setNodes((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => ({ ...node, name: newName }))
    );
  };

  const handleRunCode = async () => {
    if (isRunning) {
      abortControllerRef.current?.abort();
      setIsRunning(false);
      setIsCompiling(false);
      setIsAwaitingInput(false);
      addTerminalLog("sys", "[Process terminated]");
      return;
    }

    const files = flattenFiles(nodes);
    const hasCpp = files.some((file) => file.name.endsWith(".cpp"));

    if (!hasCpp) {
      addTerminalLog("error", "No .cpp file found to execute");
      return;
    }

    setTerminalLogs([]);
    setCurrentInput("");
    setIsRunning(true);
    setIsCompiling(true);
    setIsAwaitingInput(false);
    abortControllerRef.current = new AbortController();

    addTerminalLog("sys", "Starting compilation...");

    try {
      const response = await fetch("/api/execute/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No reader available");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;

          const eventMatch = chunk.match(/^event: (.+)$/m);
          const dataMatch = chunk.match(/^data: (.+)$/m);

          if (!eventMatch || !dataMatch) continue;

          const eventType = eventMatch[1];
          const data = JSON.parse(dataMatch[1]);

          switch (eventType) {
            case "status":
              addTerminalLog("sys", data.message);
              break;
            case "compile_output":
              if (data.output) addTerminalLog("out", data.output);
              break;
            case "compile_error":
              addTerminalLog("error", data.error);
              setIsCompiling(false);
              break;
            case "output":
              addTerminalLog("out", data.data);
              break;
            case "error_output":
              addTerminalLog("error", data.data);
              break;
            case "ready":
              setIsCompiling(false);
              setIsAwaitingInput(true);
              addTerminalLog("sys", "Waiting for input...");
              break;
            case "exit":
              addTerminalLog("sys", `Process exited with code: ${data.code}`);
              break;
            case "done":
              addTerminalLog("sys", "Execution finished");
              setIsRunning(false);
              setIsAwaitingInput(false);
              break;
            case "error":
              addTerminalLog("error", data.message);
              setIsRunning(false);
              setIsAwaitingInput(false);
              setIsCompiling(false);
              break;
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") {
        addTerminalLog("error", error.message);
      }
      setIsRunning(false);
      setIsAwaitingInput(false);
      setIsCompiling(false);
    }
  };

  const handleSendInput = async () => {
    if (!isAwaitingInput || !currentInput.trim()) return;

    const input = currentInput;
    addTerminalLog("in", input);
    setCurrentInput("");
    setIsAwaitingInput(false);

    try {
      const response = await fetch("/api/execute/stream", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error("Failed to send input");
      }
    } catch {
      addTerminalLog("error", "Failed to send input");
      setIsAwaitingInput(true);
    }
  };

  const handleCopyCode = async () => {
    if (!activeFile || activeFile.type !== "file") return;
    try {
      await navigator.clipboard.writeText(activeFile.content ?? "");
      addTerminalLog("sys", "Code copied to clipboard");
    } catch {
      addTerminalLog("error", "Failed to copy code");
    }
  };

  const handleDownloadCode = () => {
    if (!activeFile || activeFile.type !== "file") return;
    const blob = new Blob([activeFile.content ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.name || "code.cpp";
    a.click();
    URL.revokeObjectURL(url);
    addTerminalLog("sys", `Downloaded ${activeFile.name}`);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  const renderTree = (treeNodes: VfsNode[], depth = 0): ReactNode => {
    return treeNodes.map((node) => {
      const isFolder = node.type === "folder";
      const isExpanded = expandedFolders[node.id];
      const isSelected = selectedNodeId === node.id;
      const isActiveFile = activeFileId === node.id;

      return (
        <div key={node.id}>
          <div
            className={[
              "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-all",
              isSelected
                ? "bg-[#094771] text-white"
                : "text-[#d4d4d4] hover:bg-white/5",
            ].join(" ")}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => {
              setSelectedNodeId(node.id);
              if (isFolder) {
                setExpandedFolders((prev) => ({ ...prev, [node.id]: !prev[node.id] }));
              } else {
                setActiveFileId(node.id);
                setIsSidebarOpen(false);
              }
            }}
            onDoubleClick={() => {
              if (!isFolder && isSelected) handleRenameNode();
            }}
          >
            {isFolder ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#808080]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#808080]" />
                )}
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-[#e8ab53]" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-[#e8ab53]" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5" />
                <FileCode2 className="h-4 w-4 shrink-0 text-[#519aba]" />
              </>
            )}
            <span className="flex-1 truncate text-xs">{node.name}</span>

            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
              {isFolder && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      handleCreateFile();
                    }}
                    className="rounded-md p-1 text-[#9aa4b2] hover:bg-white/5 hover:text-white"
                    title="New File"
                  >
                    <Plus className="h-3 w-3" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      handleCreateFolder();
                    }}
                    className="rounded-md p-1 text-[#9aa4b2] hover:bg-white/5 hover:text-white"
                    title="New Folder"
                  >
                    <Folder className="h-3 w-3" />
                  </button>
                </>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                  handleRenameNode();
                }}
                className="rounded-md p-1 text-[#9aa4b2] hover:bg-white/5 hover:text-white"
                title="Rename"
              >
                <RefreshCw className="h-3 w-3" />
              </button>

              {node.id !== ROOT_FOLDER_ID && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    handleDeleteNode();
                  }}
                  className="rounded-md p-1 text-[#9aa4b2] hover:bg-white/5 hover:text-white"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}

              {isActiveFile && !isFolder ? (
                <div className="hidden h-1.5 w-1.5 rounded-full bg-[#3794ff] sm:block" />
              ) : null}
            </div>
          </div>

          {isFolder && isExpanded && node.children?.length ? (
            <div>{renderTree(node.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f111a]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#3794ff]" />
          <p className="text-sm text-[#9aa4b2]">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPanel onSuccess={setUser} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f111a] text-[#d4d4d4]">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/5 bg-[#11131a]/80 px-3 backdrop-blur-md sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-[#d4d4d4] transition hover:bg-white/5 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03]">
              <FileCode2 className="h-4 w-4 text-[#3794ff]" />
            </div>
            <div className="hidden text-sm font-semibold text-white sm:block">
              Code Studio
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-xs sm:flex ${
              engineStatus === "online"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : engineStatus === "checking"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                  : "border-rose-500/20 bg-rose-500/10 text-rose-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                engineStatus === "online"
                  ? "bg-emerald-400"
                  : engineStatus === "checking"
                    ? "bg-amber-400"
                    : "bg-rose-400"
              }`}
            />
            <span className="max-w-[180px] truncate">{engineName}</span>
          </div>

          <div className="hidden max-w-[180px] truncate rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-sm text-[#d4d4d4] md:block">
            {user.name}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-sm text-[#d4d4d4] transition hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden w-[280px] min-h-0 shrink-0 flex-col border-r border-white/5 bg-[#252526] lg:flex">
          <div className="flex h-11 items-center justify-between border-b border-white/5 px-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cccccc]">
              Explorer
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleCreateFile}
                className="rounded-md p-1.5 text-[#d4d4d4] transition hover:bg-white/5"
                title="New File"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={handleCreateFolder}
                className="rounded-md p-1.5 text-[#d4d4d4] transition hover:bg-white/5"
                title="New Folder"
              >
                <Folder className="h-4 w-4" />
              </button>
              <button
                onClick={handleDeleteNode}
                className="rounded-md p-1.5 text-[#d4d4d4] transition hover:bg-white/5"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="rounded-xl border border-white/5 bg-[#1e1e1e] p-2">
              {renderTree(nodes)}
            </div>
          </div>
        </aside>

        {/* Main Area */}
        <main className="min-w-0 flex-1 overflow-hidden p-2 sm:p-3 lg:p-4">
          <div className="flex h-full flex-col gap-3">
            {/* Workspace Info */}
            <section className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.14em] text-[#7c8a9a]">
                    Workspace
                  </div>
                  <div className="mt-1 truncate text-sm text-[#cfd8e3]">
                    Soft contrast, eye-friendly, responsive on all devices.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={`rounded-xl border px-3 py-1.5 text-xs ${
                      engineStatus === "online"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : engineStatus === "checking"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                          : "border-rose-500/20 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    {engineStatus === "online"
                      ? engineMeta?.selectedEngine === "piston"
                        ? "Piston"
                        : "CPP Runner"
                      : engineStatus === "checking"
                        ? "Checking..."
                        : "Offline"}
                  </div>

                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-sm text-[#d4d4d4] transition hover:bg-white/5 lg:hidden"
                  >
                    <FileCode2 className="h-4 w-4" />
                    Files
                  </button>
                </div>
              </div>
            </section>

            {/* Snippets Bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <Code2 className="h-4 w-4 text-[#3794ff]" />
              <span className="text-xs text-[#8c98a8]">Snippets:</span>
              {SNIPPETS.map((snippet) => (
                <button
                  key={snippet.name}
                  onClick={() => insertSnippet(snippet.code)}
                  className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1 text-xs transition hover:bg-white/5 hover:text-white"
                  title={`Insert ${snippet.name} snippet`}
                >
                  {snippet.name}
                </button>
              ))}
            </div>

            {/* Editor + Terminal Grid */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_0.9fr]">
              {/* Editor Panel */}
              <div className="flex min-h-0 flex-col rounded-2xl border border-white/5 bg-[#11131a] shadow-sm">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
                  <div>
                    <div className="truncate text-sm font-medium text-white">
                      {activeFile?.type === "file"
                        ? activeFile.name
                        : "Select a file"}
                    </div>
                    <div className="text-[11px] text-[#8c98a8]">C++17 • soft contrast</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={handleCopyCode}
                      className="rounded-lg p-2 text-[#cfd8e3] transition hover:bg-white/5"
                      title="Copy Code"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleDownloadCode}
                      className="rounded-lg p-2 text-[#cfd8e3] transition hover:bg-white/5"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {activeFile?.type === "file" ? (
                    <CodeEditor
                      value={activeFile.content ?? ""}
                      onChange={updateActiveFileContent}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[#8c98a8]">
                      Select a file from the explorer to start coding.
                    </div>
                  )}
                </div>
              </div>

              {/* Integrated Terminal Panel */}
              {isTerminalOpen && (
                <div className="flex min-h-0 flex-col rounded-2xl border border-white/5 bg-[#11131a] shadow-sm">
                  <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Terminal
                      </div>
                      <div className="text-[11px] text-[#8c98a8]">
                        {isCompiling
                          ? "Compiling..."
                          : isAwaitingInput
                            ? "Waiting for input"
                            : isRunning
                              ? "Running..."
                              : "Idle"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={clearTerminal}
                        className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs text-[#d4d4d4] transition hover:bg-white/5"
                      >
                        Clear
                      </button>
                      <button
                        onClick={handleRunCode}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                          isRunning
                            ? "bg-[#a31515] text-white"
                            : "bg-[#0e639c] text-white hover:bg-[#1177bb]"
                        }`}
                      >
                        {isRunning ? (
                          <>
                            <Square className="h-3.5 w-3.5" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Run
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <div
                      ref={terminalContainerRef}
                      onScroll={handleTerminalScroll}
                      className="h-full overflow-y-auto rounded-2xl border border-white/5 bg-[#0f111a] p-3 font-mono text-[12px] leading-relaxed"
                    >
                      {terminalLogs.length === 0 ? (
                        <div className="text-[#6d7886]">
                          {'> Click "Run" to execute your C++ code'}
                        </div>
                      ) : (
                        <>
                          {terminalLogs.map((log, i) => (
                            <div
                              key={i}
                              className={`mb-0.5 whitespace-pre-wrap ${
                                log.type === "in"
                                  ? "text-[#4ec9b0]"
                                  : log.type === "error"
                                    ? "text-[#f48771]"
                                    : log.type === "sys"
                                      ? "text-[#8c98a8]"
                                      : "text-[#d4d4d4]"
                              }`}
                            >
                              <span className="mr-2 text-[10px] text-[#6d7886]">
                                {formatTime(log.timestamp)}
                              </span>
                              {log.type === "in" && "> "}
                              {log.msg}
                            </div>
                          ))}
                          <div ref={terminalEndRef} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Input Bar */}
                  <div className="border-t border-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[#4ec9b0] text-sm font-mono">$</span>
                      <input
                        ref={inputRef}
                        type="text"
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSendInput();
                          }
                        }}
                        disabled={!isAwaitingInput}
                        className="flex-1 rounded-xl border border-white/5 bg-[#0f111a] px-3 py-1.5 text-sm text-[#d4d4d4] outline-none placeholder:text-[#6d7886] focus:border-[#3794ff]/40 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder={isAwaitingInput ? "Type your input here..." : "Run code to enable input"}
                      />
                      <button
                        onClick={handleSendInput}
                        disabled={!isAwaitingInput}
                        className="rounded-xl bg-[#0e639c] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#1177bb] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {isCompiling || engineStatus === "checking" ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#3794ff]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>
                        {isCompiling ? "Compiling..." : "Checking engine..."}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Toggle Terminal Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs text-[#d4d4d4] transition hover:bg-white/5"
              >
                <TerminalSquare className="h-3.5 w-3.5" />
                {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
                {isTerminalOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Sidebar (Slide-in) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] transform transition-transform duration-300 ease-out lg:hidden ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col border-r border-white/5 bg-[#252526] shadow-2xl shadow-black/40">
          <div className="flex h-14 items-center justify-between border-b border-white/5 px-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#cccccc]">
              Explorer
            </span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-md p-2 text-[#d4d4d4] transition hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="rounded-xl border border-white/5 bg-[#1e1e1e] p-2">
              {renderTree(nodes)}
            </div>
          </div>

          <div className="border-t border-white/5 p-4">
            <button
              onClick={handleDeleteNode}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 py-2 text-sm text-rose-300 transition hover:bg-rose-500/15"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop for mobile sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}