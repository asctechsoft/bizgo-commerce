import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppError } from '@bizgo/shared';
import { Clock } from '../common/clock';
import {
  bytes,
  decodeKey,
  decryptAesGcm,
  encryptAesGcm,
  hmacSha256,
  safeEqual,
} from '../common/crypto';
import { base32Encode, generateTotpSecret, otpauthUrl, totpStep, verifyTotp } from '../common/totp';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuditService } from '../infra/audit.service';
import { PrismaService } from '../infra/prisma.service';
import { RateLimiter } from '../infra/rate-limiter';
import { SessionService } from './session.service';

const ISSUER = 'BizGo';
const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class MfaService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.key = decodeKey(config.MFA_ENCRYPTION_KEY);
  }

  private recoveryHash(code: string): string {
    return hmacSha256(this.config.APP_SECRET, 'recovery', code.toUpperCase()).toString('hex');
  }

  async status(userId: string): Promise<{ enrolled: boolean }> {
    const c = await this.prisma.mfaCredential.findUnique({ where: { userId } });
    return { enrolled: !!c?.confirmedAt };
  }

  /** Start (or restart, while unconfirmed) TOTP enrolment. The secret is shown exactly once. */
  async enroll(userId: string, account: string): Promise<{ secret: string; otpauthUrl: string }> {
    const existing = await this.prisma.mfaCredential.findUnique({ where: { userId } });
    if (existing?.confirmedAt) {
      throw new AppError('INVALID_STATE_TRANSITION', 'Tài khoản đã đăng ký xác thực hai lớp.');
    }
    const secret = generateTotpSecret();
    const secretEnc = bytes(encryptAesGcm(this.key, secret));
    await this.prisma.mfaCredential.upsert({
      where: { userId },
      update: { secretEnc, lastUsedStep: null, recoveryHashes: [] },
      create: { userId, secretEnc },
    });
    const secretBase32 = base32Encode(secret);
    return {
      secret: secretBase32,
      otpauthUrl: otpauthUrl({ secretBase32, account, issuer: ISSUER }),
    };
  }

  /**
   * Verify a TOTP (or a single-use recovery code) for the current session. The first success confirms
   * enrolment and returns the recovery codes once. Replays of an already used TOTP step are rejected.
   */
  async verify(params: {
    userId: string;
    sessionId: string;
    code: string;
    requestId?: string;
  }): Promise<{ verifiedAt: Date; recoveryCodes?: string[] }> {
    const { userId, sessionId } = params;
    const code = params.code.trim();
    await this.limiter.consume(`mfa:${userId}`, 5, 15 * 60);

    const cred = await this.prisma.mfaCredential.findUnique({ where: { userId } });
    if (!cred) throw new AppError('MFA_REQUIRED', 'Chưa đăng ký xác thực hai lớp.');
    const invalid = () => new AppError('OTP_INVALID', 'Mã xác thực không đúng.');

    const now = this.clock.now();
    const isTotpShape = /^\d{6}$/.test(code);
    let recoveryCodes: string[] | undefined;

    if (isTotpShape) {
      const secret = decryptAesGcm(this.key, Buffer.from(cred.secretEnc));
      const step = verifyTotp(secret, code, now.getTime());
      if (step === null) throw invalid();
      // Replay protection: the step must be strictly newer than the last accepted one (atomic).
      const claimed = await this.prisma.$executeRaw`
        UPDATE "mfa_credentials" SET "last_used_step" = ${BigInt(step)}
        WHERE "id" = ${cred.id}::uuid AND ("last_used_step" IS NULL OR "last_used_step" < ${BigInt(step)})`;
      if (claimed !== 1) throw invalid();
      if (!cred.confirmedAt) {
        recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
          const raw = randomBytes(5).toString('hex').toUpperCase();
          return `${raw.slice(0, 5)}-${raw.slice(5)}`;
        });
        await this.prisma.mfaCredential.update({
          where: { id: cred.id },
          data: {
            confirmedAt: now,
            recoveryHashes: recoveryCodes.map((c) => this.recoveryHash(c)),
          },
        });
        await this.audit.record({
          actorId: userId,
          action: 'auth.mfa_enrolled',
          entityType: 'user',
          entityId: userId,
          requestId: params.requestId ?? null,
        });
      }
    } else if (cred.confirmedAt && /^[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}$/.test(code)) {
      const hash = this.recoveryHash(code);
      const match = cred.recoveryHashes.find((h) => safeEqual(Buffer.from(h), Buffer.from(hash)));
      if (!match) throw invalid();
      // Single use: remove atomically; if another request already removed it, reject.
      const removed = await this.prisma.$executeRaw`
        UPDATE "mfa_credentials" SET "recovery_hashes" = array_remove("recovery_hashes", ${match})
        WHERE "id" = ${cred.id}::uuid AND ${match} = ANY("recovery_hashes")`;
      if (removed !== 1) throw invalid();
      await this.audit.record({
        actorId: userId,
        action: 'auth.mfa_recovery_code_used',
        entityType: 'user',
        entityId: userId,
        requestId: params.requestId ?? null,
      });
    } else {
      throw invalid();
    }

    const verifiedAt = await this.sessions.markMfaVerified(sessionId);
    return { verifiedAt, ...(recoveryCodes ? { recoveryCodes } : {}) };
  }

  /** exposed for tests/diagnostics */
  currentStep(): number {
    return totpStep(this.clock.now().getTime());
  }
}
