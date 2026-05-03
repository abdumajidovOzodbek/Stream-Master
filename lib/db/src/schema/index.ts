import { pgTable, text, bigint } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  sessionId: text("session_id").primaryKey(),
  sessionString: text("session_string").notNull().default(""),
  phone: text("phone"),
  userId: text("user_id"),
  firstName: text("first_name"),
  username: text("username"),
  lastSeen: bigint("last_seen", { mode: "number" }).notNull(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
