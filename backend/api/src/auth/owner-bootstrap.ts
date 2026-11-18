import type { PrismaClient } from '@bizgo/db';
import { AppError } from '@bizgo/shared';
import { normalizeIdentity } from './identity';
import { assertPasswordPolicy, PasswordService } from './password.service';

/**
 * Creates the very first OWNER (ADR-0002). There is no seeded default password: the password is
 * supplied at run time. Refuses to run if an OWNER already exists. The OWNER still has to enrol TOTP
 * on first login before any admin API works (MFA is mandatory for OWNER).
 */
export async function bootstrapOwner(
  prisma: PrismaClient,
  input: { email: string; displayName: string; password: string },
): Promise<{ userId: string }> {
  const email = normalizeIdentity('EMAIL', input.email);
  assertPasswordPolicy(input.password, email);
  const role = await prisma.role.findUnique({ where: { code: 'OWNER' } });
  if (!role)
    throw new AppError('INTERNAL_ERROR', 'Roles are not seeded. Run `pnpm db:seed` first.');
  const existing = await prisma.userRole.count({ where: { roleId: role.id } });
  if (existing > 0) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      'An OWNER account already exists; bootstrap refused.',
    );
  }
  const hash = await new PasswordService().hash(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        displayName: input.displayName.trim(),
        status: 'ACTIVE',
        identities: { create: { type: 'EMAIL', valueNorm: email, verifiedAt: new Date() } },
        passwordCredential: { create: { hash } },
        roles: { create: { roleId: role.id } },
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'auth.owner_bootstrapped',
        entityType: 'user',
        entityId: u.id,
        actorRole: 'SYSTEM_CLI',
      },
    });
    return u;
  });
  return { userId: user.id };
}
