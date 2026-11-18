import type { Request } from 'express';
import type { Permission, RoleCode, SessionRealm } from '@bizgo/shared';

export interface AuthContext {
  userId: string;
  sessionId: string;
  familyId: string;
  realm: SessionRealm;
  displayName: string;
  roles: RoleCode[];
  permissions: ReadonlySet<Permission>;
  /** true when any held role is in MFA_REQUIRED_ROLES */
  mfaRequired: boolean;
  mfaVerifiedAt: Date | null;
  csrfSecret: Buffer;
  viaCookie: boolean;
  ipHash: string | null;
}

export type AuthedRequest = Request & { auth?: AuthContext; requestId: string };

/** Token prefix per realm; lets us reject wrong-realm tokens before touching the DB. */
export const REALM_PREFIX: Record<SessionRealm, string> = {
  CUSTOMER: 'bgc',
  ADMIN: 'bga',
  FACTORY: 'bgf',
};

export const REALM_COOKIE_PREFIX: Record<SessionRealm, string> = {
  CUSTOMER: 'bg_',
  ADMIN: 'bg_admin_',
  FACTORY: 'bg_factory_',
};

export function cookieNames(realm: SessionRealm): {
  access: string;
  refresh: string;
  csrf: string;
} {
  const p = REALM_COOKIE_PREFIX[realm];
  return { access: `${p}sid`, refresh: `${p}rt`, csrf: `${p}csrf` };
}
