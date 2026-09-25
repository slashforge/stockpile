// Persistence for bag lots (kept separate from positions.ts so tests can mock storage without interpreting Drizzle SQL).
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@stockpile/core/db";
import { bagLots } from "@stockpile/core/db/schema";

export type LotRow = typeof bagLots.$inferSelect;
export type NewLot = typeof bagLots.$inferInsert;

export async function findLotBySignature(signature: string): Promise<LotRow | null> {
  const [row] = await db.select().from(bagLots).where(eq(bagLots.signature, signature));
  return row ?? null;
}
export async function listLots(userId: string): Promise<LotRow[]> {
  return db.select().from(bagLots).where(eq(bagLots.userId, userId));
}
export async function hasBuyLot(userId: string, bagId: string, mint: string): Promise<LotRow | null> {
  const [row] = await db.select().from(bagLots).where(and(eq(bagLots.userId, userId), eq(bagLots.bagId, bagId), eq(bagLots.mint, mint), eq(bagLots.side, "buy")));
  return row ?? null;
}
/** Inserts unless the signature already exists (unique); returns the inserted row or null on conflict. */
export async function insertLot(values: NewLot): Promise<LotRow | null> {
  const [row] = await db.insert(bagLots).values(values).onConflictDoNothing().returning();
  return row ?? null;
}
export async function lotLinks(userId: string, signatures: string[]): Promise<Map<string, string>> {
  if (!signatures.length) return new Map();
  const rows = await db.select({ signature: bagLots.signature, bagId: bagLots.bagId }).from(bagLots).where(and(eq(bagLots.userId, userId), inArray(bagLots.signature, signatures)));
  return new Map(rows.map((row) => [row.signature, row.bagId]));
}
