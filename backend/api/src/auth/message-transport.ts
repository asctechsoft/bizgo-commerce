import { Injectable, Logger } from '@nestjs/common';
import type { IdentityType } from '@bizgo/db';
import { AppError } from '@bizgo/shared';

export interface OutboundMessage {
  kind: 'OTP' | 'PASSWORD_RESET';
  targetType: IdentityType;
  target: string;
  /** OTP digits (kind=OTP) */
  code?: string;
  /** One-use reset token (kind=PASSWORD_RESET) */
  resetToken?: string;
}

/**
 * Delivery port for OTP / recovery messages. Real providers (email/SMS/Zalo) are blocked on D15.
 * Production without a provider fails closed with 503 OTP_DELIVERY_NOT_CONFIGURED.
 */
export abstract class MessageTransport {
  abstract isConfigured(): boolean;
  abstract send(message: OutboundMessage): Promise<void>;

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new AppError(
        'OTP_DELIVERY_NOT_CONFIGURED',
        'Hệ thống chưa cấu hình kênh gửi mã xác thực. Vui lòng liên hệ BizGo.',
      );
    }
  }
}

/** Used when no provider has been approved/configured. */
@Injectable()
export class UnconfiguredTransport extends MessageTransport {
  isConfigured(): boolean {
    return false;
  }
  async send(): Promise<void> {
    this.assertConfigured();
  }
}

/**
 * Local-development transport (DEV_OTP_CONSOLE=true, never in production): keeps messages in memory
 * and logs them to the server console. The code is NEVER returned by any API response.
 */
@Injectable()
export class DevConsoleTransport extends MessageTransport {
  private readonly logger = new Logger('DevConsoleTransport');
  readonly outbox: OutboundMessage[] = [];

  isConfigured(): boolean {
    return true;
  }

  async send(message: OutboundMessage): Promise<void> {
    this.outbox.push(message);
    this.logger.warn(
      `[DEV ONLY] ${message.kind} to ${message.targetType}:${message.target} ` +
        `${message.code ? `code=${message.code}` : `token=${message.resetToken}`}`,
    );
  }

  lastFor(target: string, kind: OutboundMessage['kind'] = 'OTP'): OutboundMessage | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const m = this.outbox[i] as OutboundMessage;
      if (m.target === target && m.kind === kind) return m;
    }
    return undefined;
  }
}
