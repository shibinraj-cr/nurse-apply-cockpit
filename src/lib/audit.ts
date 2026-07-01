// Append-only, hash-chained audit log (DESIGN.md §2/§6 — "the legal defense").
// Each row's hash covers the previous row's hash, so any tampering with history
// breaks the chain. NODE-ONLY (node:crypto + Prisma).

import { Prisma } from '@prisma/client';
import { sha256 } from './crypto';
import { prisma } from './db';
import { toJson } from './utils';

export interface AuditEntry {
  actor: string;
  action: string;
  candidateId?: string | null;
  entityRef?: string | null;
  before?: unknown;
  after?: unknown;
}

function chainPayload(p: {
  seq: number;
  prevHash: string;
  actor: string;
  action: string;
  candidateId: string | null;
  entityRef: string | null;
  before: string | null;
  after: string | null;
  ts: string;
}): string {
  return JSON.stringify(p);
}

/**
 * Append an audit row, extending the hash chain. `seq` is assigned in code
 * (SQLite can't autoincrement a non-id column), so two concurrent appends can
 * read the same max seq and collide on the @unique constraint; we retry on that
 * collision so the append never silently loses an audit record.
 *
 * Note: the domain write and this append are separate transactions today. For a
 * single-operator deployment that is acceptable; threading one tx through every
 * action is the follow-up for stronger atomicity.
 */
export async function appendAudit(entry: AuditEntry) {
  const MAX_ATTEMPTS = 6;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' } });
        const seq = (last?.seq ?? 0) + 1;
        const prevHash = last?.hash ?? '';
        const ts = new Date();
        const before = entry.before === undefined ? null : toJson(entry.before);
        const after = entry.after === undefined ? null : toJson(entry.after);
        const candidateId = entry.candidateId ?? null;
        const entityRef = entry.entityRef ?? null;

        const hash = sha256(
          chainPayload({
            seq,
            prevHash,
            actor: entry.actor,
            action: entry.action,
            candidateId,
            entityRef,
            before,
            after,
            ts: ts.toISOString(),
          }),
        );

        return tx.auditLog.create({
          data: {
            seq,
            prevHash,
            hash,
            actor: entry.actor,
            action: entry.action,
            candidateId,
            entityRef,
            before,
            after,
            ts,
          },
        });
      });
    } catch (e) {
      const isSeqCollision =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (isSeqCollision && attempt < MAX_ATTEMPTS) continue; // re-read max seq + retry
      throw e;
    }
  }
}

/** Recompute the chain and report the first row (if any) that fails to verify. */
export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAtSeq?: number; count: number }> {
  const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
  let prevHash = '';
  for (const row of rows) {
    const expected = sha256(
      chainPayload({
        seq: row.seq,
        prevHash,
        actor: row.actor,
        action: row.action,
        candidateId: row.candidateId,
        entityRef: row.entityRef,
        before: row.before,
        after: row.after,
        ts: row.ts.toISOString(),
      }),
    );
    if (expected !== row.hash || row.prevHash !== prevHash) {
      return { ok: false, brokenAtSeq: row.seq, count: rows.length };
    }
    prevHash = row.hash;
  }
  return { ok: true, count: rows.length };
}
