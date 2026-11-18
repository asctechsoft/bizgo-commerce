import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission, SessionRealm } from '@bizgo/shared';
import type { AuthContext, AuthedRequest } from './auth.types';

export const IS_PUBLIC = 'bizgo:is-public';
export const REALMS = 'bizgo:realms';
export const PERMISSIONS_REQUIRED = 'bizgo:permissions';
export const ALLOW_PENDING_MFA = 'bizgo:allow-pending-mfa';
export const FRESH_MFA_SECONDS = 'bizgo:fresh-mfa';
export const SKIP_CSRF = 'bizgo:skip-csrf';

/** Route may be called without a session; if a session exists it is still resolved. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Pre-authentication endpoints (login, register, OTP, password recovery, refresh) do not act on an
 * existing session, so the double-submit CSRF header is not required. Everything else enforces it.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

/** Realm(s) whose sessions this route accepts. Default: CUSTOMER. */
export const Realm = (...realms: SessionRealm[]) => SetMetadata(REALMS, realms);

/** ALL listed permissions are required. */
export const RequirePermissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_REQUIRED, perms);

/** Allows an MFA-pending session (used only by the MFA enrol/verify endpoints). */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);

/** Sensitive action: requires MFA verified within `seconds` (step-up). */
export const RequireFreshMfa = (seconds = 300) => SetMetadata(FRESH_MFA_SECONDS, seconds);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new Error('CurrentAuth used on a route without an authenticated session');
    return req.auth;
  },
);

export const MaybeAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext | undefined => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  },
);

export const RequestMeta = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): { ip: string | null; ua: string | null; requestId: string } => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return { ip: req.ip ?? null, ua: req.header('user-agent') ?? null, requestId: req.requestId };
  },
);
