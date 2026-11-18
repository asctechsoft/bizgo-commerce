import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { AppError } from '@bizgo/shared';

/** Small deny-list; a full breached-password check is a later hardening item. */
const COMMON = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  'password123',
  'password1234',
  'qwertyuiop',
  'qwerty12345',
  'iloveyou123',
  'matkhau1234',
  'admin12345',
  'bizgo12345',
  '0000000000',
  '1111111111',
]);

export function assertPasswordPolicy(password: string, identityHint?: string): void {
  if (password.length < 10)
    throw new AppError('VALIDATION_ERROR', 'Mật khẩu phải có ít nhất 10 ký tự.');
  if (password.length > 128) throw new AppError('VALIDATION_ERROR', 'Mật khẩu tối đa 128 ký tự.');
  if (COMMON.has(password.toLowerCase())) {
    throw new AppError('VALIDATION_ERROR', 'Mật khẩu quá phổ biến. Vui lòng chọn mật khẩu khác.');
  }
  if (identityHint) {
    const local = identityHint.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      throw new AppError('VALIDATION_ERROR', 'Mật khẩu không được chứa thông tin đăng nhập.');
    }
  }
}

// OWASP-recommended minimum for Argon2id: m=19 MiB, t=2, p=1.
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  /** A valid hash of a random value, used to equalise timing for unknown identities. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }

  /** Burn the same CPU as a real verification. Always returns false. */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(`dummy-${Math.random()}-${Date.now()}`);
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
