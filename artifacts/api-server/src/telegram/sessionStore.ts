import { logger } from "../lib/logger";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface SessionRecord {
  sessionString: string;
  phone?: string;
  userId?: string;
  firstName?: string;
  username?: string;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// In-memory write-through cache — avoids a DB round-trip on every request.
// The cache is populated lazily on first read for a given sessionId and is
// kept in sync on every write.
// ---------------------------------------------------------------------------

const _cache = new Map<string, SessionRecord>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const hit = _cache.get(sessionId);
  if (hit) return hit;

  try {
    const rows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0]!;
    const record: SessionRecord = {
      sessionString: row.sessionString,
      phone: row.phone ?? undefined,
      userId: row.userId ?? undefined,
      firstName: row.firstName ?? undefined,
      username: row.username ?? undefined,
      lastSeen: row.lastSeen,
    };
    _cache.set(sessionId, record);
    return record;
  } catch (err) {
    logger.warn({ err, sessionId }, "Failed to read session from DB — session treated as missing");
    return null;
  }
}

export async function saveSession(
  sessionId: string,
  update: Partial<SessionRecord> & { sessionString: string },
): Promise<void> {
  const existing = _cache.get(sessionId) ?? null;
  const record: SessionRecord = {
    ...existing,
    ...update,
    lastSeen: Date.now(),
  };
  _cache.set(sessionId, record);

  try {
    await db
      .insert(sessionsTable)
      .values({
        sessionId,
        sessionString: record.sessionString,
        phone: record.phone ?? null,
        userId: record.userId ?? null,
        firstName: record.firstName ?? null,
        username: record.username ?? null,
        lastSeen: record.lastSeen,
      })
      .onConflictDoUpdate({
        target: sessionsTable.sessionId,
        set: {
          sessionString: record.sessionString,
          phone: record.phone ?? null,
          userId: record.userId ?? null,
          firstName: record.firstName ?? null,
          username: record.username ?? null,
          lastSeen: record.lastSeen,
        },
      });
  } catch (err) {
    logger.error({ err, sessionId }, "Failed to persist session to DB");
  }
}

export async function clearSession(sessionId: string): Promise<void> {
  const existing = _cache.get(sessionId);
  if (existing) {
    const cleared: SessionRecord = { sessionString: "", lastSeen: Date.now() };
    _cache.set(sessionId, cleared);
  }

  try {
    await db
      .insert(sessionsTable)
      .values({
        sessionId,
        sessionString: "",
        phone: null,
        userId: null,
        firstName: null,
        username: null,
        lastSeen: Date.now(),
      })
      .onConflictDoUpdate({
        target: sessionsTable.sessionId,
        set: {
          sessionString: "",
          phone: null,
          userId: null,
          firstName: null,
          username: null,
          lastSeen: Date.now(),
        },
      });
  } catch (err) {
    logger.error({ err, sessionId }, "Failed to clear session in DB");
  }
}

export async function getAllSessions(): Promise<Record<string, SessionRecord>> {
  try {
    const rows = await db.select().from(sessionsTable);
    const result: Record<string, SessionRecord> = {};
    for (const row of rows) {
      const record: SessionRecord = {
        sessionString: row.sessionString,
        phone: row.phone ?? undefined,
        userId: row.userId ?? undefined,
        firstName: row.firstName ?? undefined,
        username: row.username ?? undefined,
        lastSeen: row.lastSeen,
      };
      result[row.sessionId] = record;
      _cache.set(row.sessionId, record);
    }
    return result;
  } catch (err) {
    logger.error({ err }, "Failed to read all sessions from DB");
    const result: Record<string, SessionRecord> = {};
    for (const [id, rec] of _cache.entries()) {
      result[id] = rec;
    }
    return result;
  }
}

export function touchSession(sessionId: string): void {
  const hit = _cache.get(sessionId);
  if (hit) {
    hit.lastSeen = Date.now();
    void saveSession(sessionId, hit);
  }
}
