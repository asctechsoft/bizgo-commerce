import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AppError, type Permission, type SessionRealm } from '@bizgo/shared';
import { Clock } from '../common/clock';
import { safeEqual } from '../common/crypto';
import { AuditService } from '../infra/audit.service';
import { cookieNames, type AuthedRequest } from './auth.types';
import {
  ALLOW_PENDING_MFA,
  FRESH_MFA_SECONDS,
  IS_PUBLIC,
  PERMISSIONS_REQUIRED,
  REALMS,
  SKIP_CSRF,
} from './decorators';
import { SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: authentication (cookie or bearer) → realm → CSRF (cookie auth only) → MFA state →
 * permission codes. Resource-scope checks (own/org/assigned) happen in services (ADR-0002/0008).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger('AuthGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) === true;
    let realms = this.reflector.getAllAndOverride<SessionRealm[]>(REALMS, targets) ?? ['CUSTOMER'];
    // Browsers share cookies per host (not per port): the UI says which realm it means so a customer
    // cookie can never be mistaken for an admin one on multi-realm endpoints (/auth/session, logout...).
    const hint = req.header('x-realm') as SessionRealm | undefined;
    if (hint && realms.includes(hint)) realms = [hint];
    const required =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_REQUIRED, targets) ?? [];
    const allowPendingMfa =
      this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_MFA, targets) === true;
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, targets) === true;
    const freshMfa = this.reflector.getAllAndOverride<number>(FRESH_MFA_SECONDS, targets);

    const { token, viaCookie } = this.extractToken(req, realms);
    const auth = token ? await this.sessions.authenticate(token, realms, viaCookie) : null;
    if (auth) req.auth = auth;

    if (!auth) {
      if (isPublic) return true;
      throw new AppError('UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục.');
    }

    // CSRF: only for cookie-authenticated unsafe requests (bearer clients are not ambient-credential based).
    if (viaCookie && !skipCsrf && !SAFE_METHODS.has(req.method)) {
      const sent = req.header('x-csrf-token');
      const expected = this.sessions.csrfTokenFor(auth.csrfSecret);
      if (!sent || !safeEqual(Buffer.from(sent), Buffer.from(expected))) {
        throw new AppError('FORBIDDEN', 'Yêu cầu bị từ chối vì thiếu hoặc sai mã CSRF.');
      }
    }

    if (auth.mfaRequired && !auth.mfaVerifiedAt && !allowPendingMfa) {
      throw new AppError('MFA_REQUIRED', 'Vui lòng hoàn tất xác thực hai lớp để tiếp tục.');
    }
    if (required.length > 0 && !required.every((p) => auth.permissions.has(p))) {
      this.logger.warn(
        `forbidden requestId=${req.requestId} user=${auth.userId} ${req.method} ${req.path} needs=${required.join(',')}`,
      );
      void this.audit
        .record({
          actorId: auth.userId,
          actorRole: auth.roles.join(','),
          action: 'auth.forbidden_access',
          entityType: 'route',
          entityId: `${req.method} ${req.route?.path ?? req.path}`,
          requestId: req.requestId,
          ipHash: auth.ipHash,
        })
        .catch(() => undefined);
      throw new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    }
    if (freshMfa !== undefined) {
      const ageMs = auth.mfaVerifiedAt
        ? this.clock.now().getTime() - auth.mfaVerifiedAt.getTime()
        : Infinity;
      if (ageMs > freshMfa * 1000) {
        throw new AppError(
          'STEP_UP_REQUIRED',
          'Vui lòng xác thực lại bằng mã hai lớp để thực hiện thao tác này.',
        );
      }
    }

    // Make sure proxies/browsers never cache authenticated responses.
    res.setHeader('Cache-Control', 'no-store');
    return true;
  }

  private extractToken(
    req: AuthedRequest,
    realms: SessionRealm[],
  ): { token: string | null; viaCookie: boolean } {
    const header = req.header('authorization');
    if (header?.toLowerCase().startsWith('bearer ')) {
      return { token: header.slice(7).trim(), viaCookie: false };
    }
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
    for (const realm of realms) {
      const v = cookies[cookieNames(realm).access];
      if (v) return { token: v, viaCookie: true };
    }
    return { token: null, viaCookie: false };
  }
}
