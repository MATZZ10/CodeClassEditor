import { NextRequest } from "next/server";
import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";

export const SESSION_COOKIE_NAME = "ccs_session";

const DATA_DIR = path.join(process.cwd(), "data", "auth");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SESSION_DAYS = 30;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type UserRecord = PublicUser & {
  passwordHash: string;
  salt: string;
};

type SessionRecord = {
  token: string;
  userId: string;
  expiresAt: string;
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify([], null, 2), "utf8");
  }

  try {
    await fs.access(SESSIONS_FILE);
  } catch {
    await fs.writeFile(SESSIONS_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

export function sanitizeName(name: string) {
  return String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64) as Buffer;
  return {
    salt,
    hash: derived.toString("hex"),
  };
}

export function verifyPassword(password: string, salt: string, storedHash: string) {
  const derived = crypto.scryptSync(password, salt, 64) as Buffer;
  const computed = Buffer.from(derived.toString("hex"), "hex");
  const expected = Buffer.from(storedHash, "hex");

  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

async function readUsers() {
  await ensureStore();
  return readJson<UserRecord[]>(USERS_FILE, []);
}

async function writeUsers(users: UserRecord[]) {
  await ensureStore();
  await writeJson(USERS_FILE, users);
}

async function readSessions() {
  await ensureStore();
  return readJson<SessionRecord[]>(SESSIONS_FILE, []);
}

async function writeSessions(sessions: SessionRecord[]) {
  await ensureStore();
  await writeJson(SESSIONS_FILE, sessions);
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  const users = await readUsers();
  return users.find((user) => user.email === normalized) ?? null;
}

export async function findUserById(id: string) {
  const users = await readUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function createUser(input: { name: string; email: string; password: string }) {
  const users = await readUsers();
  const normalizedEmail = normalizeEmail(input.email);

  if (users.some((u) => u.email === normalizedEmail)) {
    throw new Error("Email sudah terdaftar.");
  }

  const name = sanitizeName(input.name);
  if (name.length < 2) {
    throw new Error("Nama terlalu pendek.");
  }

  if (input.password.length < 6) {
    throw new Error("Password minimal 6 karakter.");
  }

  const id = createId();
  const now = new Date().toISOString();
  const { salt, hash } = hashPassword(input.password);

  const user: UserRecord = {
    id,
    name,
    email: normalizedEmail,
    passwordHash: hash,
    salt,
    createdAt: now,
  };

  users.push(user);
  await writeUsers(users);

  return user;
}

export async function validateUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const ok = verifyPassword(password, user.salt, user.passwordHash);
  if (!ok) return null;

  return user;
}

export async function createSession(userId: string) {
  const sessions = await readSessions();
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  sessions.push({
    token,
    userId,
    expiresAt,
  });

  await writeSessions(sessions);
  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  const sessions = await readSessions();
  const next = sessions.filter((session) => session.token !== token);
  await writeSessions(next);
}

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const sessions = await readSessions();
  const session = sessions.find((item) => item.token === token);
  if (!session) return null;

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await revokeSession(token);
    return null;
  }

  const user = await findUserById(session.userId);
  if (!user) return null;

  return user;
}