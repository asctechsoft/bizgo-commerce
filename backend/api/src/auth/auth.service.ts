import { Inject, Injectable } from '@nestjs/common';
import type { IdentityType, SessionRealm } from '@bizgo/db';
import { AppError, MFA_REQUIRED_ROLES, ROLE_CODES, ROLE_REALM, type RoleCode } from '@bizgo/shared';
import { Clock } from '../common/clock';
import { bytes, randomToken, sha256 } from '../common/crypto';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuditService } from '../infra/audit.service';
import { OutboxService } from '../infra/outbox.service';
import { PrismaService } from '../infra/prisma.service';
import { RateLimiter } from '../infra/rate-limiter';
import { detectIdentityType, maskIdentity, normalizeIdentity } from './identity';
import { MessageTransport } from './message-transport';
import { MfaService } from './mfa.service';
import { OtpService } from './otp.service';
import { assertPasswordPolicy, PasswordService } from './password.service';
import { SessionService, type IssuedTokens } from './session.service';

export interface ClientMeta {
  ip: string | null;
  ua: string | null;
  requestId: string;
}

export interface SessionSummary {
  user: { id: string; displayName: string; roles: RoleCode[]; realm: SessionRealm };
  mfa: { required: boolean; enrolled: boolean; verified: boolean };
}

export interface LoginResult extends SessionSummary {
  tokens: IssuedTokens;
}

const RESET_TTL_MS = 30 * 60 * 1000;
const CONSENT_VERSION = 'draft-1'; // real policy version pending D09; recorded so consent is traceable

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly mfa: MfaService,
    private readonly transport: MessageTransport,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private ipLimit(n: number): number {
    return n * this.config.RATE_LIMIT_IP_MULTIPLIER;
  }

  // ───────────────────────────── Registration & verification ─────────────────────────────

  async register(
    input: { identity: string; password: string; displayName: string; acceptTerms: boolean },
    meta: ClientMeta,
  ): Promise<{ requiresVerification: true; target: string; resendAfterSec: number }> {
    if (!input.acceptTerms) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Bạn cần đồng ý với điều khoản và chính sách để đăng ký.',
      );
    }
    this.transport.assertConfigured(); // OTP delivery is blocked on D15: fail closed
    const type = detectIdentityType(input.identity);
    const norm = normalizeIdentity(type, input.identity);
    assertPasswordPolicy(input.password, norm);
    const ipHash = this.sessions.hashIp(meta.ip);
    await this.limiter.consume(`register:ip:${ipHash ?? 'unknown'}`, this.ipLimit(10), 3600);

    const existing = await this.prisma.identity.findUnique({
      where: { type_valueNorm: { type, valueNorm: norm } },
      include: { user: { include: { identities: true, roles: { include: { role: true } } } } },
    });
    const passwordHash = await this.passwords.hash(input.password);
    let userId: string;

    if (existing) {
      const taken =
        existing.user.identities.some((i) => i.verifiedAt) ||
        existing.user.roles.some((r) => r.role.code !== 'CUSTOMER');
      if (taken)
        throw new AppError('EMAIL_OR_PHONE_TAKEN', 'Email hoặc số điện thoại đã được đăng ký.');
      // Unverified squatter record: let the real owner take it over (new password, new OTP).
      userId = existing.userId;
      await this.prisma.$transaction([
        this.prisma.passwordCredential.upsert({
          where: { userId },
          update: { hash: passwordHash },
          create: { userId, hash: passwordHash },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { displayName: input.displayName.trim() },
        }),
      ]);
    } else {
      const customerRole = await this.prisma.role.findUniqueOrThrow({
        where: { code: 'CUSTOMER' },
      });
      const user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            displayName: input.displayName.trim(),
            status: 'PENDING_VERIFICATION',
            identities: { create: { type, valueNorm: norm } },
            passwordCredential: { create: { hash: passwordHash } },
            roles: { create: { roleId: customerRole.id } },
            consents: {
              create: { purpose: 'TERMS_AND_PRIVACY', version: CONSENT_VERSION, ipHash },
            },
          },
        });
        await this.audit.record(
          {
            actorId: u.id,
            action: 'auth.registered',
            entityType: 'user',
            entityId: u.id,
            requestId: meta.requestId,
            ipHash,
          },
          tx,
        );
        await this.outbox.enqueue(
          {
            aggregateType: 'user',
            aggregateId: u.id,
            type: 'user.registered',
            payload: { userId: u.id },
            dedupeKey: `user.registered:${u.id}`,
          },
          tx,
        );
        return u;
      });
      userId = user.id;
    }

    const issued = await this.otp.issue({
      targetType: type,
      targetNorm: norm,
      purpose: 'REGISTER_VERIFY',
      userId,
    });
    return {
      requiresVerification: true,
      target: maskIdentity(type, norm),
      resendAfterSec: issued.resendAfterSec,
    };
  }

  async requestOtp(
    input: { identity: string; purpose: 'REGISTER_VERIFY' },
    meta: ClientMeta,
  ): Promise<{
    sent: true;
    resendAfterSec: number;
  }> {
    this.transport.assertConfigured();
    const type = detectIdentityType(input.identity);
    const norm = normalizeIdentity(type, input.identity);
    await this.limiter.consume(
      `otp:ip:${this.sessions.hashIp(meta.ip) ?? 'unknown'}`,
      this.ipLimit(20),
      3600,
    );
    // Non-enumerating: respond identically whether or not an unverified identity exists.
    const identity = await this.prisma.identity.findUnique({
      where: { type_valueNorm: { type, valueNorm: norm } },
    });
    if (identity && !identity.verifiedAt) {
      const issued = await this.otp.issue({
        targetType: type,
        targetNorm: norm,
        purpose: input.purpose,
        userId: identity.userId,
      });
      return { sent: true, resendAfterSec: issued.resendAfterSec };
    }
    return { sent: true, resendAfterSec: 60 };
  }

  async verifyOtp(
    input: { identity: string; code: string; purpose: 'REGISTER_VERIFY' },
    meta: ClientMeta,
  ): Promise<{
    verified: true;
  }> {
    const type = detectIdentityType(input.identity);
    const norm = normalizeIdentity(type, input.identity);
    await this.limiter.consume(
      `otp:verify:ip:${this.sessions.hashIp(meta.ip) ?? 'unknown'}`,
      this.ipLimit(30),
      3600,
    );
    const { userId } = await this.otp.verify(
      { targetType: type, targetNorm: norm, purpose: input.purpose },
      input.code,
    );
    if (!userId) throw new AppError('OTP_INVALID', 'Mã xác thực không đúng hoặc đã hết hiệu lực.');
    await this.prisma.$transaction(async (tx) => {
      await tx.identity.updateMany({
        where: { userId, type, valueNorm: norm, verifiedAt: null },
        data: { verifiedAt: this.clock.now() },
      });
      await tx.user.updateMany({
        where: { id: userId, status: 'PENDING_VERIFICATION' },
        data: { status: 'ACTIVE' },
      });
      await this.audit.record(
        {
          actorId: userId,
          action: 'auth.identity_verified',
          entityType: 'user',
          entityId: userId,
          requestId: meta.requestId,
        },
        tx,
      );
      await this.outbox.enqueue(
        {
          aggregateType: 'user',
          aggregateId: userId,
          type: 'user.verified',
          payload: { userId },
          dedupeKey: `user.verified:${userId}:${norm}`,
        },
        tx,
      );
    });
    return { verified: true };
  }

  // ───────────────────────────── Login / session ─────────────────────────────

  async login(
    input: { identity: string; password: string; realm: SessionRealm },
    meta: ClientMeta,
  ): Promise<LoginResult> {
    const invalid = () =>
      new AppError('CREDENTIALS_INVALID', 'Thông tin đăng nhập không chính xác.');
    let type: IdentityType;
    let norm: string;
    try {
      type = detectIdentityType(input.identity);
      norm = normalizeIdentity(type, input.identity);
    } catch {
      await this.passwords.verifyDummy(input.password);
      throw invalid();
    }
    const ipHash = this.sessions.hashIp(meta.ip);
    // Budget counts every attempt; a success resets the per-identity counter.
    await this.limiter.consume(`login:ip:${ipHash ?? 'unknown'}`, this.ipLimit(30), 15 * 60);
    await this.limiter.consume(`login:id:${norm}`, 5, 15 * 60);

    const identity = await this.prisma.identity.findUnique({
      where: { type_valueNorm: { type, valueNorm: norm } },
      include: {
        user: {
          include: {
            passwordCredential: true,
            roles: { include: { role: true } },
            identities: true,
          },
        },
      },
    });
    const user = identity?.user;
    const hash = user?.passwordCredential?.hash;
    const passwordOk = hash
      ? await this.passwords.verify(hash, input.password)
      : await this.passwords.verifyDummy(input.password);

    const roles = (user?.roles ?? [])
      .map((r) => r.role.code)
      .filter((c): c is RoleCode => (ROLE_CODES as readonly string[]).includes(c));
    const realmAllowed = roles.some((r) => ROLE_REALM[r] === input.realm);

    if (!user || !passwordOk || !realmAllowed || user.status === 'SUSPENDED' || user.deletedAt) {
      await this.audit.record({
        actorId: user?.id ?? null,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user?.id ?? 'unknown',
        after: { realm: input.realm },
        requestId: meta.requestId,
        ipHash,
      });
      throw invalid();
    }
    if (!identity?.verifiedAt || user.status === 'PENDING_VERIFICATION') {
      throw new AppError(
        'ACCOUNT_NOT_VERIFIED',
        'Tài khoản chưa được xác thực. Vui lòng nhập mã xác thực đã gửi.',
      );
    }

    await this.limiter.reset(`login:id:${norm}`);
    const mfaRequired =
      roles.some((r) => MFA_REQUIRED_ROLES.includes(r)) && input.realm !== 'CUSTOMER';
    const tokens = await this.sessions.create(user.id, input.realm, {
      ipHash,
      uaHash: meta.ua ? sha256(meta.ua).toString('hex').slice(0, 32) : null,
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: this.clock.now() },
    });
    if (input.realm !== 'CUSTOMER') {
      await this.audit.record({
        actorId: user.id,
        actorRole: roles.join(','),
        action: 'auth.privileged_login',
        entityType: 'user',
        entityId: user.id,
        after: { realm: input.realm, mfaRequired },
        requestId: meta.requestId,
        ipHash,
      });
    }
    const enrolled = (await this.mfa.status(user.id)).enrolled;
    return {
      tokens,
      user: { id: user.id, displayName: user.displayName, roles, realm: input.realm },
      mfa: { required: mfaRequired, enrolled, verified: false },
    };
  }

  async refresh(
    refreshToken: string,
    realms: SessionRealm[],
    meta: ClientMeta,
  ): Promise<LoginResult> {
    const ipHash = this.sessions.hashIp(meta.ip);
    const { tokens, userId, realm } = await this.sessions.refresh(refreshToken, realms, {
      ipHash,
      uaHash: meta.ua ? sha256(meta.ua).toString('hex').slice(0, 32) : null,
    });
    const summary = await this.summary(userId, realm, tokens.sessionId);
    return { tokens, ...summary };
  }

  async summary(userId: string, realm: SessionRealm, sessionId?: string): Promise<SessionSummary> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const roles = user.roles
      .map((r) => r.role.code)
      .filter((c): c is RoleCode => (ROLE_CODES as readonly string[]).includes(c));
    const session = sessionId
      ? await this.prisma.session.findUnique({ where: { id: sessionId } })
      : null;
    return {
      user: { id: user.id, displayName: user.displayName, roles, realm },
      mfa: {
        required: roles.some((r) => MFA_REQUIRED_ROLES.includes(r)) && realm !== 'CUSTOMER',
        enrolled: (await this.mfa.status(userId)).enrolled,
        verified: !!session?.mfaVerifiedAt,
      },
    };
  }

  async logout(familyId: string, userId: string, meta: ClientMeta): Promise<void> {
    await this.sessions.revokeFamily(familyId, 'LOGOUT');
    await this.audit.record({
      actorId: userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: userId,
      requestId: meta.requestId,
    });
  }

  // ───────────────────────────── Passwords ─────────────────────────────

  async changePassword(
    userId: string,
    familyId: string,
    input: { currentPassword: string; newPassword: string },
    meta: ClientMeta,
  ): Promise<void> {
    await this.limiter.consume(`pwchange:${userId}`, 5, 15 * 60);
    const cred = await this.prisma.passwordCredential.findUnique({ where: { userId } });
    if (!cred || !(await this.passwords.verify(cred.hash, input.currentPassword))) {
      throw new AppError('CREDENTIALS_INVALID', 'Mật khẩu hiện tại không đúng.');
    }
    const ident = await this.prisma.identity.findFirst({ where: { userId } });
    assertPasswordPolicy(input.newPassword, ident?.valueNorm);
    const hash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.update({ where: { userId }, data: { hash } });
      await this.audit.record(
        {
          actorId: userId,
          action: 'auth.password_changed',
          entityType: 'user',
          entityId: userId,
          requestId: meta.requestId,
        },
        tx,
      );
    });
    await this.sessions.revokeAllForUser(userId, 'PASSWORD_CHANGED', familyId);
  }

  /** Always resolves the same way (non-enumerating). */
  async forgotPassword(input: { identity: string }, meta: ClientMeta): Promise<{ accepted: true }> {
    this.transport.assertConfigured();
    let type: IdentityType;
    let norm: string;
    try {
      type = detectIdentityType(input.identity);
      norm = normalizeIdentity(type, input.identity);
    } catch {
      return { accepted: true };
    }
    await this.limiter.consume(
      `forgot:ip:${this.sessions.hashIp(meta.ip) ?? 'unknown'}`,
      this.ipLimit(10),
      3600,
    );
    await this.limiter.consume(`forgot:id:${norm}`, 3, 3600);
    const identity = await this.prisma.identity.findUnique({
      where: { type_valueNorm: { type, valueNorm: norm } },
      include: { user: true },
    });
    if (identity?.verifiedAt && identity.user.status === 'ACTIVE') {
      const token = randomToken(32);
      await this.prisma.passwordResetToken.create({
        data: {
          userId: identity.userId,
          tokenHash: bytes(sha256(token)),
          expiresAt: new Date(this.clock.now().getTime() + RESET_TTL_MS),
        },
      });
      await this.transport.send({
        kind: 'PASSWORD_RESET',
        targetType: type,
        target: norm,
        resetToken: token,
      });
    }
    return { accepted: true };
  }

  async resetPassword(
    input: { token: string; newPassword: string },
    meta: ClientMeta,
  ): Promise<void> {
    const invalid = () =>
      new AppError('VALIDATION_ERROR', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    await this.limiter.consume(
      `reset:ip:${this.sessions.hashIp(meta.ip) ?? 'unknown'}`,
      this.ipLimit(20),
      3600,
    );
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: bytes(sha256(input.token)) },
    });
    if (!row || row.usedAt || row.expiresAt <= this.clock.now()) throw invalid();
    const ident = await this.prisma.identity.findFirst({ where: { userId: row.userId } });
    assertPasswordPolicy(input.newPassword, ident?.valueNorm);
    const hash = await this.passwords.hash(input.newPassword);
    // One-use: claim atomically.
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: this.clock.now() },
    });
    if (claimed.count !== 1) throw invalid();
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.upsert({
        where: { userId: row.userId },
        update: { hash },
        create: { userId: row.userId, hash },
      });
      await this.audit.record(
        {
          actorId: row.userId,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: row.userId,
          requestId: meta.requestId,
        },
        tx,
      );
    });
    await this.sessions.revokeAllForUser(row.userId, 'PASSWORD_RESET');
  }
}
