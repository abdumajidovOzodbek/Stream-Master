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

function readMap(): SessionMap {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, "utf8").trim();
      if (raw) return JSON.parse(raw) as SessionMap;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to read sessions.json");
  }
  return {};
}

let _writing = false;
let _queued: SessionMap | null = null;

async function writeMap(map: SessionMap): Promise<void> {
  if (_writing) { _queued = map; return; }
  _writing = true;
  try {
    await fsp.mkdir(STORAGE_DIR, { recursive: true });
    await fsp.writeFile(SESSIONS_FILE, JSON.stringify(map, null, 2), "utf8");
  } finally {
    _writing = false;
    if (_queued) { const q = _queued; _queued = null; await writeMap(q); }
  }
}

export function getSession(sessionId: string): SessionRecord | null {
  return readMap()[sessionId] ?? null;
}

export async function saveSession(
  sessionId: string,
  update: Partial<SessionRecord> & { sessionString: string },
): Promise<void> {
  const map = readMap();
  map[sessionId] = { ...map[sessionId], ...update, lastSeen: Date.now() };
  await writeMap(map);
}

export async function clearSession(sessionId: string): Promise<void> {
  const map = readMap();
  if (map[sessionId]) {
    map[sessionId] = { sessionString: "", lastSeen: Date.now() };
    await writeMap(map);
  }
}

export function getAllSessions(): SessionMap {
  return readMap();
}
