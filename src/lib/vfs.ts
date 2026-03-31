export type VfsNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null;
  content?: string;
  createdAt: number;
  updatedAt: number;
};

export type ExecutionFile = {
  name: string;
  content: string;
  encoding: "utf8";
};

const ROOT_NAME = "workspace";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `node_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sanitizeSegment(input: string) {
  return input
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function splitBaseExt(name: string) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return { base: name, ext: "" };
  }

  return {
    base: name.slice(0, dotIndex),
    ext: name.slice(dotIndex),
  };
}

function siblingNameTaken(
  nodes: VfsNode[],
  parentId: string | null,
  candidate: string,
  excludeId?: string
) {
  return nodes.some(
    (node) =>
      node.parentId === parentId &&
      node.id !== excludeId &&
      node.name.toLowerCase() === candidate.toLowerCase()
  );
}

function uniqueSiblingName(
  nodes: VfsNode[],
  parentId: string | null,
  rawName: string,
  excludeId?: string
) {
  const cleaned = sanitizeSegment(rawName);
  const fallback = "untitled";
  const safe = cleaned.length > 0 ? cleaned : fallback;

  const { base, ext } = splitBaseExt(safe);
  let candidate = `${base}${ext}`;
  let index = 2;

  while (siblingNameTaken(nodes, parentId, candidate, excludeId)) {
    candidate = `${base}-${index}${ext}`;
    index += 1;
  }

  return candidate;
}

export function createInitialWorkspace(): VfsNode[] {
  const rootId = createId();
  const mainId = createId();
  const now = Date.now();

  return [
    {
      id: rootId,
      name: ROOT_NAME,
      type: "folder",
      parentId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mainId,
      name: "main.cpp",
      type: "file",
      parentId: rootId,
      content: `#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Halo, dunia!\\n";
    return 0;
}
`,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function getRootNode(nodes: VfsNode[]) {
  return nodes.find((node) => node.parentId === null && node.type === "folder") ?? null;
}

export function getNodeById(nodes: VfsNode[], id: string) {
  return nodes.find((node) => node.id === id) ?? null;
}

export function getChildren(nodes: VfsNode[], parentId: string | null) {
  return [...nodes]
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function getNodePath(nodes: VfsNode[], nodeId: string) {
  const node = getNodeById(nodes, nodeId);
  if (!node) return "";

  const parts: string[] = [];
  let current: VfsNode | null = node;

  while (current && current.parentId !== null) {
    parts.unshift(current.name);
    current = getNodeById(nodes, current.parentId);
  }

  return parts.join("/");
}

export function findFirstFileId(nodes: VfsNode[]) {
  return nodes.find((node) => node.type === "file")?.id ?? null;
}

export function createFileNode(
  nodes: VfsNode[],
  parentId: string | null,
  name: string,
  content = ""
) {
  const now = Date.now();
  const id = createId();
  const finalName = uniqueSiblingName(nodes, parentId, name);
  const next: VfsNode[] = [
    ...nodes,
    {
      id,
      name: finalName,
      type: "file",
      parentId,
      content,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { nodes: next, id };
}

export function createFolderNode(
  nodes: VfsNode[],
  parentId: string | null,
  name: string
) {
  const now = Date.now();
  const id = createId();
  const finalName = uniqueSiblingName(nodes, parentId, name);
  const next: VfsNode[] = [
    ...nodes,
    {
      id,
      name: finalName,
      type: "folder",
      parentId,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { nodes: next, id };
}

export function renameNode(nodes: VfsNode[], id: string, nextName: string) {
  const target = getNodeById(nodes, id);
  if (!target || target.parentId === null) return nodes;

  const finalName = uniqueSiblingName(nodes, target.parentId, nextName, id);

  return nodes.map((node) =>
    node.id === id
      ? { ...node, name: finalName, updatedAt: Date.now() }
      : node
  );
}

export function deleteNode(nodes: VfsNode[], id: string) {
  const target = getNodeById(nodes, id);
  if (!target || target.parentId === null) return nodes;

  const idsToDelete = new Set<string>();

  const mark = (nodeId: string) => {
    idsToDelete.add(nodeId);
    for (const child of getChildren(nodes, nodeId)) {
      mark(child.id);
    }
  };

  mark(id);

  return nodes.filter((node) => !idsToDelete.has(node.id));
}

export function toExecutionFiles(nodes: VfsNode[]): ExecutionFile[] {
  return nodes
    .filter((node) => node.type === "file")
    .map((node) => ({
      name: getNodePath(nodes, node.id),
      content: node.content ?? "",
      encoding: "utf8" as const,
    }))
    .filter((file) => file.name.trim().length > 0);
}