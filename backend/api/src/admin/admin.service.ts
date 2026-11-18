import { Injectable } from '@nestjs/common';
import { ROLE_REALM, type RoleCode, ROLE_CODES } from '@bizgo/shared';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async audit(before: number | undefined, limit: number) {
    const rows = await this.prisma.auditLog.findMany({
      where: before ? { id: { lt: BigInt(before) } } : {},
      orderBy: { id: 'desc' },
      take: limit,
    });
    return {
      items: rows.map((r) => ({
        id: Number(r.id),
        occurredAt: r.occurredAt,
        actorId: r.actorId,
        actorRole: r.actorRole,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        requestId: r.requestId,
        reason: r.reason,
      })),
      nextBefore: rows.length === limit ? Number(rows[rows.length - 1]?.id ?? 0) : null,
    };
  }

  async staffUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: { some: { role: { code: { notIn: ['CUSTOMER', 'WHOLESALE_CUSTOMER'] } } } },
      },
      include: { roles: { include: { role: true } }, identities: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => {
      const roles = u.roles
        .map((r) => r.role.code)
        .filter((c): c is RoleCode => (ROLE_CODES as readonly string[]).includes(c));
      return {
        id: u.id,
        displayName: u.displayName,
        status: u.status,
        roles,
        realms: [...new Set(roles.map((r) => ROLE_REALM[r]))],
        lastLoginAt: u.lastLoginAt,
      };
    });
  }
}
