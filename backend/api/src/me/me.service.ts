import { Injectable } from '@nestjs/common';
import { AppError } from '@bizgo/shared';
import { PrismaService } from '../infra/prisma.service';
import { AuditService } from '../infra/audit.service';

export interface AddressDto {
  id: string;
  receiverName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  detail: string;
  isDefault: boolean;
}

export interface AddressInput {
  receiverName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  detail: string;
  isDefault?: boolean;
}

const MAX_ADDRESSES = 20;

function toDto(a: {
  id: string;
  receiverName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  detail: string;
  isDefault: boolean;
}): AddressDto {
  return {
    id: a.id,
    receiverName: a.receiverName,
    phone: a.phone,
    province: a.province,
    district: a.district,
    ward: a.ward,
    detail: a.detail,
    isDefault: a.isDefault,
  };
}

/** Every query is scoped by the session's user id; foreign ids behave as NOT_FOUND (ADR-0002). */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { identities: true },
    });
    return {
      id: user.id,
      displayName: user.displayName,
      identities: user.identities.map((i) => ({
        type: i.type,
        value: i.valueNorm,
        verified: !!i.verifiedAt,
      })),
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, input: { displayName?: string }) {
    if (input.displayName !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: input.displayName.trim() },
      });
    }
    return this.profile(userId);
  }

  async listAddresses(userId: string): Promise<AddressDto[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async createAddress(userId: string, input: AddressInput): Promise<AddressDto> {
    const count = await this.prisma.address.count({ where: { userId, deletedAt: null } });
    if (count >= MAX_ADDRESSES) {
      throw new AppError('VALIDATION_ERROR', `Bạn chỉ có thể lưu tối đa ${MAX_ADDRESSES} địa chỉ.`);
    }
    const makeDefault = input.isDefault === true || count === 0;
    const created = await this.prisma.$transaction(async (tx) => {
      if (makeDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      return tx.address.create({
        data: {
          userId,
          receiverName: input.receiverName.trim(),
          phone: input.phone.trim(),
          province: input.province.trim(),
          district: input.district.trim(),
          ward: input.ward.trim(),
          detail: input.detail.trim(),
          isDefault: makeDefault,
        },
      });
    });
    return toDto(created);
  }

  async updateAddress(
    userId: string,
    id: string,
    input: Partial<AddressInput>,
  ): Promise<AddressDto> {
    const existing = await this.prisma.address.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw new AppError('NOT_FOUND', 'Không tìm thấy địa chỉ.');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id },
        data: {
          ...(input.receiverName !== undefined ? { receiverName: input.receiverName.trim() } : {}),
          ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
          ...(input.province !== undefined ? { province: input.province.trim() } : {}),
          ...(input.district !== undefined ? { district: input.district.trim() } : {}),
          ...(input.ward !== undefined ? { ward: input.ward.trim() } : {}),
          ...(input.detail !== undefined ? { detail: input.detail.trim() } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
      });
    });
    return toDto(updated);
  }

  async deleteAddress(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.address.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw new AppError('NOT_FOUND', 'Không tìm thấy địa chỉ.');
    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}
