import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";

const STORAGE_DIR = path.resolve(process.cwd(), "storage");
const SESSIONS_FILE = path.join(STORAGE_DIR, "sessions.json");

export interface SessionRecord {
  sessionString: string;
  phone?: string;
  userId?: string;
  firstName?: string;
  username?: string;
  lastSeen: number;
}

type SessionMap = Record<string, SessionRecord>;

// ---------------------------------------------------------------------------
// In-memory cache — loaded once at startup, kept in sync on every write.
// This eliminates synchronous disk reads on every API call.
// ---------------------------------------------------------------------------

let _cache: SessionMap | null = null;

function loadCache(): SessionMap {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, "utf8").trim();
      if (raw) return JSON.parse(raw) as SessionMap;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to read sessions.json — starting with empty store");
  }
  return {};
}

function getCache(): SessionMap {
  if (_cache === null) _cache = loadCache();
  return _cache;
}

// ---------------------------------------------------------------------------
// Async write queue — prevents concurrent writes from clobbering each other
// ---------------------------------------------------------------------------

let _writing = false;
let _queued: SessionMap | null = null;

async function writeMap(map: SessionMap): Promise<void> {
  if (_writing) { _queued = map; return; }
  _writing = true;
  try {
    await fsp.mkdir(STORAGE_DIR, { recursive: true });
    await fsp.writeFile(SESSIONS_FILE, JSON.stringify(map, null, 2), "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to write sessions.json");
  } finally {
    _writing = false;
    if (_queued) { const q = _queued; _queued = null; await writeMap(q); }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSession(sessionId: string): SessionRecord | null {
  return getCache()[sessionId] ?? null;
}

export async function saveSession(
  sessionId: string,
  update: Partial<SessionRecord> & { sessionString: string },
): Promise<void> {
  const map = getCache();
  map[sessionId] = { ...map[sessionId], ...update, lastSeen: Date.now() };
  await writeMap(map);
}

export async function clearSession(sessionId: string): Promise<void> {
  const map = getCache();
  if (map[sessionId]) {
    map[sessionId] = { sessionString: "", lastSeen: Date.now() };
    await writeMap(map);
  }
}

export function getAllSessions(): SessionMap {
  return getCache();
}

export function touchSession(sessionId: string): void {
  const map = getCache();
  if (map[sessionId]) {
    map[sessionId] = { ...map[sessionId], lastSeen: Date.now() };
    void writeMap(map);
  }
}
