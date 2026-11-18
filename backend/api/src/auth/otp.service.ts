import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IdentityType, OtpPurpose } from '@bizgo/db';
import { AppError } from '@bizgo/shared';
import { Clock } from '../common/clock';
import { bytes, hmacSha256, randomDigits, safeEqual } from '../common/crypto';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../infra/prisma.service';
import { RateLimiter } from '../infra/rate-limiter';
import { MessageTransport } from './message-transport';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;

export interface OtpTarget {
  targetType: IdentityType;
  targetNorm: string;
  purpose: OtpPurpose;
  userId?: string | null;
}

/**
 * OTP lifecycle (ADR-0002): CSPRNG 6 digits, stored only as HMAC(secret, challengeId|code),
 * 5-minute TTL, 5 verify attempts, 60 s resend cooldown, 5 sends/hour per target.
 * There is no fixed or test code anywhere; tests read the dev transport outbox.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transport: MessageTransport,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private codeHmac(challengeId: string, code: string): Buffer {
    return hmacSha256(this.config.APP_SECRET, 'otp', challengeId, code);
  }

  /** Create + send a code. Used for first request and resend (cooldown applies to both). */
  async issue(
    target: OtpTarget,
  ): Promise<{ challengeId: string; expiresAt: Date; resendAfterSec: number }> {
    this.transport.assertConfigured(); // fail closed BEFORE creating anything

    const now = this.clock.now();
    const latest = await this.prisma.otpChallenge.findFirst({
      where: {
        targetType: target.targetType,
        targetNorm: target.targetNorm,
        purpose: target.purpose,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && now.getTime() - latest.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      const retry = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (now.getTime() - latest.lastSentAt.getTime())) / 1000,
      );
      throw new AppError('RATE_LIMITED', 'Vui lòng chờ trước khi yêu cầu mã mới.', [
        { retryAfterSec: retry },
      ]);
    }
    await this.limiter.consume(
      `otp:send:${target.purpose}:${target.targetNorm}`,
      OTP_MAX_SENDS_PER_HOUR,
      3600,
    );

    // A new code invalidates every earlier unconsumed code for this target+purpose.
    await this.prisma.otpChallenge.updateMany({
      where: {
        targetType: target.targetType,
        targetNorm: target.targetNorm,
        purpose: target.purpose,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    const code = randomDigits(6);
    const id = randomUUID();
    const created = await this.prisma.otpChallenge.create({
      data: {
        id,
        userId: target.userId ?? null,
        targetType: target.targetType,
        targetNorm: target.targetNorm,
        purpose: target.purpose,
        codeHmac: bytes(this.codeHmac(id, code)),
        maxAttempts: OTP_MAX_ATTEMPTS,
        sendCount: (latest?.sendCount ?? 0) + 1,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
    });

    await this.transport.send({
      kind: 'OTP',
      targetType: target.targetType,
      target: target.targetNorm,
      code,
    });
    return {
      challengeId: created.id,
      expiresAt: created.expiresAt,
      resendAfterSec: OTP_RESEND_COOLDOWN_MS / 1000,
    };
  }

  /** Verify the most recent live challenge. Consumes it on success; locks after max attempts. */
  async verify(target: OtpTarget, code: string): Promise<{ userId: string | null }> {
    const now = this.clock.now();
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        targetType: target.targetType,
        targetNorm: target.targetNorm,
        purpose: target.purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge)
      throw new AppError('OTP_INVALID', 'Mã xác thực không đúng hoặc đã hết hiệu lực.');
    if (challenge.lockedAt || challenge.attempts >= challenge.maxAttempts) {
      throw new AppError(
        'OTP_LOCKED',
        'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.',
      );
    }
    if (challenge.expiresAt <= now) {
      throw new AppError('OTP_EXPIRED', 'Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    // Count the attempt atomically BEFORE comparing (parallel guesses cannot exceed the budget).
    const bumped = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        attempts: { lt: challenge.maxAttempts },
        consumedAt: null,
        lockedAt: null,
      },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count !== 1) {
      throw new AppError(
        'OTP_LOCKED',
        'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.',
      );
    }

    const ok =
      /^\d{6}$/.test(code) &&
      safeEqual(this.codeHmac(challenge.id, code), Buffer.from(challenge.codeHmac));
    if (!ok) {
      if (challenge.attempts + 1 >= challenge.maxAttempts) {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { lockedAt: now },
        });
        throw new AppError(
          'OTP_LOCKED',
          'Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.',
        );
      }
      throw new AppError('OTP_INVALID', 'Mã xác thực không đúng hoặc đã hết hiệu lực.');
    }

    // Single-use: only one of two parallel correct submissions can consume it.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1)
      throw new AppError('OTP_INVALID', 'Mã xác thực không đúng hoặc đã hết hiệu lực.');
    return { userId: challenge.userId };
  }
}
