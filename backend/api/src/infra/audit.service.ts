import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipHash?: string | null;
  reason?: string | null;
}

const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'otp',
  'code',
  'secret',
  'secretenc',
  'csrfsecret',
  'recoverycodes',
  'recoveryhashes',
  'codehmac',
]);

/** Remove secrets/PII-like keys before persisting `before`/`after` snapshots (ADR-0007). */
export function redactForAudit(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return typeof v === 'bigint' ? v.toString() : v;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : walk(val);
    }
    return out;
  };
  return walk(value) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write inside the caller's transaction (required for money/state mutations). */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: redactForAudit(entry.before),
        after: redactForAudit(entry.after),
        requestId: entry.requestId ?? null,
        ipHash: entry.ipHash ?? null,
        reason: entry.reason ?? null,
      },
    });
  }
}
