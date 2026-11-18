import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { SessionRealm } from '@bizgo/db';
import {
  MFA_REQUIRED_ROLES,
  ROLE_CODES,
  type Permission,
  type RoleCode,
  PERMISSIONS,
  AppError,
} from '@bizgo/shared';
import { Clock } from '../common/clock';
import { bytes, hmacSha256, randomToken, sha256 } from '../common/crypto';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuditService } from '../infra/audit.service';
import { PrismaService } from '../infra/prisma.service';
import { REALM_PREFIX, type AuthContext } from './auth.types';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** ADR-0002: privileged realms have short idle/absolute lifetimes. */
export const SESSION_TTL: Record<
  SessionRealm,
  { access: number; refresh: number; absolute: number }
> = {
  CUSTOMER: { access: 15 * MIN, refresh: 30 * DAY, absolute: 90 * DAY },
  ADMIN: { access: 15 * MIN, refresh: 8 * HOUR, absolute: 24 * HOUR },
  FACTORY: { access: 15 * MIN, refresh: 8 * HOUR, absolute: 24 * HOUR },
};

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  sessionId: string;
}

export interface SessionMeta {
  ipHash: string | null;
  uaHash: string | null;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  hashIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    return hmacSha256(this.config.APP_SECRET, 'ip', ip).toString('hex').slice(0, 32);
  }

  csrfTokenFor(csrfSecret: Buffer): string {
    return hmacSha256(this.config.APP_SECRET, 'csrf', csrfSecret).toString('base64url');
  }

  async create(
    userId: string,
    realm: SessionRealm,
    meta: SessionMeta,
    opts: { familyId?: string; absoluteExpiresAt?: Date; mfaVerifiedAt?: Date | null } = {},
  ): Promise<IssuedTokens> {
    const now = this.clock.now();
    const ttl = SESSION_TTL[realm];
    const prefix = REALM_PREFIX[realm];
    const accessToken = `${prefix}.${randomToken(32)}`;
    const refreshToken = `${prefix}.${randomToken(32)}`;
    const csrfSecret = randomBytes(32);
    const accessExpiresAt = new Date(now.getTime() + ttl.access);
    const absoluteExpiresAt = opts.absoluteExpiresAt ?? new Date(now.getTime() + ttl.absolute);
    const refreshExpiresAt = new Date(
      Math.min(now.getTime() + ttl.refresh, absoluteExpiresAt.getTime()),
    );
    const row = await this.prisma.session.create({
      data: {
        userId,
        realm,
        familyId: opts.familyId ?? randomUUID(),
        accessHash: bytes(sha256(accessToken)),
        refreshHash: bytes(sha256(refreshToken)),
        csrfSecret: bytes(csrfSecret),
        accessExpiresAt,
        refreshExpiresAt,
        absoluteExpiresAt,
        mfaVerifiedAt: opts.mfaVerifiedAt ?? null,
        ipHash: meta.ipHash,
        uaHash: meta.uaHash,
      },
    });
    return {
      accessToken,
      refreshToken,
      csrfToken: this.csrfTokenFor(csrfSecret),
      accessExpiresAt,
      refreshExpiresAt,
      sessionId: row.id,
    };
  }

  /** Resolve an access token to an AuthContext, or null when invalid/expired/wrong realm. */
  async authenticate(
    token: string,
    allowedRealms: SessionRealm[],
    viaCookie: boolean,
  ): Promise<AuthContext | null> {
    const realm = (Object.entries(REALM_PREFIX).find(([, p]) => token.startsWith(`${p}.`))?.[0] ??
      null) as SessionRealm | null;
    if (!realm || !allowedRealms.includes(realm)) return null; // rejected before any DB access
    const now = this.clock.now();
    const session = await this.prisma.session.findUnique({
      where: { accessHash: bytes(sha256(token)) },
      include: {
        user: {
          include: {
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });
    if (
      !session ||
      session.realm !== realm ||
      session.usedAt ||
      session.revokedAt ||
      session.accessExpiresAt <= now ||
      session.absoluteExpiresAt <= now ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt
    ) {
      return null;
    }
    const roles = session.user.roles
      .map((ur) => ur.role.code)
      .filter((c): c is RoleCode => (ROLE_CODES as readonly string[]).includes(c));
    const known = new Set<string>(PERMISSIONS);
    const permissions = new Set<Permission>();
    for (const ur of session.user.roles) {
      for (const rp of ur.role.permissions) {
        if (known.has(rp.permission.code)) permissions.add(rp.permission.code as Permission);
      }
    }
    return {
      userId: session.userId,
      sessionId: session.id,
      familyId: session.familyId,
      realm,
      displayName: session.user.displayName,
      roles,
      permissions,
      mfaRequired: roles.some((r) => MFA_REQUIRED_ROLES.includes(r)),
      mfaVerifiedAt: session.mfaVerifiedAt,
      csrfSecret: Buffer.from(session.csrfSecret),
      viaCookie,
      ipHash: session.ipHash,
    };
  }

  /**
   * Rotate a refresh token. Presenting an already-used or revoked refresh token is treated as theft:
   * the entire token family is revoked.
   */
  async refresh(
    refreshToken: string,
    allowedRealms: SessionRealm[],
    meta: SessionMeta,
  ): Promise<{
    tokens: IssuedTokens;
    userId: string;
    realm: SessionRealm;
  }> {
    const unauth = () =>
      new AppError('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    const realm = (Object.entries(REALM_PREFIX).find(([, p]) =>
      refreshToken.startsWith(`${p}.`),
    )?.[0] ?? null) as SessionRealm | null;
    if (!realm || !allowedRealms.includes(realm)) throw unauth();

    const now = this.clock.now();
    const row = await this.prisma.session.findUnique({
      where: { refreshHash: bytes(sha256(refreshToken)) },
    });
    if (!row || row.realm !== realm) throw unauth();

    if (row.usedAt || row.revokedAt) {
      await this.revokeFamily(row.familyId, 'REFRESH_REUSE');
      await this.audit.record({
        actorId: row.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'session_family',
        entityId: row.familyId,
        ipHash: meta.ipHash,
      });
      throw unauth();
    }
    if (row.refreshExpiresAt <= now || row.absoluteExpiresAt <= now) throw unauth();

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw unauth();

    // Atomically claim the token; if another request won the race this one is a reuse.
    const claimed = await this.prisma.session.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(row.familyId, 'REFRESH_REUSE');
      throw unauth();
    }
    const tokens = await this.create(row.userId, realm, meta, {
      familyId: row.familyId,
      absoluteExpiresAt: row.absoluteExpiresAt,
      mfaVerifiedAt: row.mfaVerifiedAt,
    });
    return { tokens, userId: row.userId, realm };
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string, exceptFamilyId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}),
      },
      data: { revokedAt: this.clock.now(), revokedReason: reason },
    });
  }

  async markMfaVerified(sessionId: string): Promise<Date> {
    const at = this.clock.now();
    await this.prisma.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: at } });
    return at;
  }
}
