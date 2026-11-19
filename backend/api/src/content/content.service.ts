import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { AppError } from '@bizgo/shared';
import { normalizeIdentity } from '../auth/identity';
import { SessionService } from '../auth/session.service';
import { Paginated } from '../common/http';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { hmacSha256 } from '../common/crypto';
import { AuditService } from '../infra/audit.service';
import { PrismaService } from '../infra/prisma.service';
import { RateLimiter } from '../infra/rate-limiter';
import type {
  ArticleCreateDto,
  ArticleUpdateDto,
  InquiryCreateDto,
  ARTICLE_CATEGORIES,
  INQUIRY_STATUSES,
} from './content.dto';

type Category = (typeof ARTICLE_CATEGORIES)[number];
type InquiryStatusCode = (typeof INQUIRY_STATUSES)[number];

export interface ArticleSummaryDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: Category;
  coverImage: string | null;
  featured: boolean;
  readMinutes: number;
  publishedAt: Date | null;
}
export interface ArticleDetailDto extends ArticleSummaryDto {
  body: string;
  related: ArticleSummaryDto[];
}
export interface AdminArticleDto extends ArticleSummaryDto {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteInfoDto {
  contact: {
    hotline: string | null;
    email: string | null;
    hours: string | null;
    address: string | null;
    addressNote: string | null;
    social: {
      facebook: string | null;
      zalo: string | null;
      youtube: string | null;
      tiktok: string | null;
    };
  };
  wholesaleTiers: {
    key: string;
    name: string;
    audience: string;
    discountPercent: number;
    minMonthlyVnd: number;
    perks: string[];
    popular: boolean;
  }[];
  guideTips: string[];
}

const SETTING_CONTACT = 'site.contact';
const SETTING_TIERS = 'site.wholesale_tiers';
const SETTING_TIPS = 'site.guide_tips';

const WORDS_PER_MINUTE = 200;

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function readMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

const optStr = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
};
const httpsUrl = (v: unknown): string | null => {
  const s = optStr(v, 300);
  return s && /^https:\/\/[^\s]+$/.test(s) ? s : null;
};

/** Defensive parse: settings are owner-editable JSON, so the public endpoint never trusts their shape. */
export function parseSiteInfo(m: Map<string, unknown>): SiteInfoDto {
  const c = (m.get(SETTING_CONTACT) ?? {}) as Record<string, unknown>;
  const social = (c.social ?? {}) as Record<string, unknown>;
  const tiersRaw = m.get(SETTING_TIERS);
  const tipsRaw = m.get(SETTING_TIPS);
  const tiers: SiteInfoDto['wholesaleTiers'] = [];
  if (Array.isArray(tiersRaw)) {
    for (const t of tiersRaw.slice(0, 6) as Record<string, unknown>[]) {
      const name = optStr(t?.name, 80);
      const key = optStr(t?.key, 40);
      const pct = Number(t?.discountPercent);
      const min = Number(t?.minMonthlyVnd);
      if (!name || !key || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
      if (!Number.isSafeInteger(min) || min < 0) continue;
      tiers.push({
        key,
        name,
        audience: optStr(t.audience, 160) ?? '',
        discountPercent: pct,
        minMonthlyVnd: min,
        perks: Array.isArray(t.perks)
          ? t.perks
              .map((p) => optStr(p, 120))
              .filter((p): p is string => !!p)
              .slice(0, 6)
          : [],
        popular: t.popular === true,
      });
    }
  }
  return {
    contact: {
      hotline: optStr(c.hotline, 40),
      email: optStr(c.email, 254),
      hours: optStr(c.hours, 160),
      address: optStr(c.address, 300),
      addressNote: optStr(c.addressNote, 160),
      social: {
        facebook: httpsUrl(social.facebook),
        zalo: httpsUrl(social.zalo),
        youtube: httpsUrl(social.youtube),
        tiktok: httpsUrl(social.tiktok),
      },
    },
    wholesaleTiers: tiers,
    guideTips: Array.isArray(tipsRaw)
      ? tipsRaw
          .map((x) => optStr(x, 200))
          .filter((x): x is string => !!x)
          .slice(0, 8)
      : [],
  };
}

const SUMMARY = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  category: true,
  coverImage: true,
  featured: true,
  readMinutes: true,
  publishedAt: true,
} satisfies Prisma.ArticleSelect;

/** Guide articles (editable data), site info (owner settings) and public lead forms. */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ───────────── public ─────────────

  private livePublished(): Prisma.ArticleWhereInput {
    return { status: 'PUBLISHED', publishedAt: { lte: new Date() } };
  }

  async listPublic(q: {
    category?: Category | undefined;
    featured?: boolean | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<Paginated<ArticleSummaryDto>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 12;
    const where: Prisma.ArticleWhereInput = {
      ...this.livePublished(),
      ...(q.category ? { category: q.category } : {}),
      ...(q.featured ? { featured: true } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        select: SUMMARY,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return new Paginated(items, page, limit, total);
  }

  async getPublic(slug: string): Promise<ArticleDetailDto> {
    const a = await this.prisma.article.findFirst({
      where: { slug, ...this.livePublished() },
      select: { ...SUMMARY, body: true },
    });
    if (!a) throw new AppError('NOT_FOUND', 'Không tìm thấy bài viết.');
    const related = await this.prisma.article.findMany({
      where: { ...this.livePublished(), category: a.category, NOT: { id: a.id } },
      select: SUMMARY,
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });
    return { ...a, related };
  }

  async siteInfo(): Promise<SiteInfoDto> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: [SETTING_CONTACT, SETTING_TIERS, SETTING_TIPS] } },
    });
    return parseSiteInfo(new Map(rows.map((r) => [r.key, r.value])));
  }

  /** Public lead form. Anti-abuse: honeypot, per-IP budget, duplicate suppression; replies never reveal dedupe. */
  async createInquiry(
    dto: InquiryCreateDto,
    meta: { ip: string | null; requestId: string },
  ): Promise<{ accepted: true }> {
    if (dto.consent !== true)
      throw new AppError('VALIDATION_ERROR', 'Vui lòng đồng ý để BizGo liên hệ với bạn.');
    const ipHash = this.sessions.hashIp(meta.ip);
    await this.limiter.consume(
      `inquiry:ip:${ipHash ?? 'unknown'}`,
      8 * this.config.RATE_LIMIT_IP_MULTIPLIER,
      3600,
    );
    if (dto.website && dto.website.trim() !== '') return { accepted: true }; // honeypot: pretend success

    const email = dto.email ? normalizeIdentity('EMAIL', dto.email) : null;
    if (dto.kind === 'NEWSLETTER') {
      if (!email) throw new AppError('VALIDATION_ERROR', 'Vui lòng nhập email.');
      await this.limiter.consume(`inquiry:nl:${email}`, 3, 86_400);
      const exists = await this.prisma.inquiry.findFirst({
        where: { kind: 'NEWSLETTER', email, status: { not: 'SPAM' } },
        select: { id: true },
      });
      if (!exists)
        await this.prisma.inquiry.create({ data: { kind: 'NEWSLETTER', email, ipHash } });
      return { accepted: true };
    }

    if (!dto.fullName || !dto.phone || !dto.message)
      throw new AppError('VALIDATION_ERROR', 'Vui lòng điền đủ họ tên, số điện thoại và nội dung.');
    const phone = normalizeIdentity('PHONE', dto.phone);
    const dedupe = hmacSha256('inquiry', 'dup', `${dto.kind}|${phone}|${dto.message.trim()}`)
      .toString('hex')
      .slice(0, 32);
    const dup = await this.limiter.hit(`inquiry:dup:${dedupe}`, 1, 600);
    if (!dup.allowed) return { accepted: true };

    const row = await this.prisma.inquiry.create({
      data: {
        kind: dto.kind,
        fullName: dto.fullName.trim(),
        phone,
        email,
        businessType: dto.businessType ?? null,
        province: dto.province?.trim() || null,
        topic: dto.topic ?? null,
        message: dto.message.trim(),
        ipHash,
      },
    });
    await this.audit.record({
      action: 'inquiry.created',
      entityType: 'inquiry',
      entityId: row.id,
      after: { kind: dto.kind },
      requestId: meta.requestId,
      ipHash,
    });
    return { accepted: true };
  }

  // ───────────── admin: articles ─────────────

  private toAdmin(a: Prisma.ArticleGetPayload<object>): AdminArticleDto {
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      category: a.category,
      coverImage: a.coverImage,
      featured: a.featured,
      readMinutes: a.readMinutes,
      publishedAt: a.publishedAt,
      status: a.status,
      body: a.body,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  async adminList(q: {
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined;
    category?: Category | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<Paginated<AdminArticleDto>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.ArticleWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return new Paginated(
      rows.map((r) => this.toAdmin(r)),
      page,
      limit,
      total,
    );
  }

  async adminGet(id: string): Promise<AdminArticleDto> {
    const a = await this.prisma.article.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Không tìm thấy bài viết.');
    return this.toAdmin(a);
  }

  private async uniqueSlug(base: string, ignoreId?: string): Promise<string> {
    const root = base || 'bai-viet';
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? root : `${root}-${i + 1}`;
      const hit = await this.prisma.article.findUnique({ where: { slug }, select: { id: true } });
      if (!hit || hit.id === ignoreId) return slug;
    }
    throw new AppError('VALIDATION_ERROR', 'Không tạo được slug duy nhất, vui lòng đặt slug khác.');
  }

  async adminCreate(
    actorId: string,
    dto: ArticleCreateDto,
    requestId: string,
  ): Promise<AdminArticleDto> {
    const slug = await this.uniqueSlug(dto.slug ?? slugify(dto.title));
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.article.create({
        data: {
          slug,
          title: dto.title.trim(),
          excerpt: dto.excerpt.trim(),
          body: dto.body.trim(),
          category: dto.category,
          coverImage: dto.coverImage ?? null,
          featured: dto.featured ?? false,
          readMinutes: readMinutes(dto.body),
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      await this.audit.record(
        {
          actorId,
          action: 'article.created',
          entityType: 'article',
          entityId: created.id,
          after: { slug },
          requestId,
        },
        tx,
      );
      return created;
    });
    return this.toAdmin(row);
  }

  async adminUpdate(
    actorId: string,
    id: string,
    dto: ArticleUpdateDto,
    requestId: string,
  ): Promise<AdminArticleDto> {
    const before = await this.prisma.article.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Không tìm thấy bài viết.');
    if (before.status === 'PUBLISHED' && dto.slug && dto.slug !== before.slug)
      throw new AppError(
        'VALIDATION_ERROR',
        'Không đổi slug của bài đã xuất bản (giữ link ổn định).',
      );
    const slug =
      dto.slug && dto.slug !== before.slug ? await this.uniqueSlug(dto.slug, id) : undefined;
    const body = dto.body?.trim();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id },
        data: {
          ...(slug ? { slug } : {}),
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt.trim() } : {}),
          ...(body !== undefined ? { body, readMinutes: readMinutes(body) } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.coverImage !== undefined ? { coverImage: dto.coverImage } : {}),
          ...(dto.featured !== undefined ? { featured: dto.featured } : {}),
          updatedBy: actorId,
        },
      });
      await this.audit.record(
        {
          actorId,
          action: 'article.updated',
          entityType: 'article',
          entityId: id,
          before: { slug: before.slug, title: before.title, featured: before.featured },
          after: { slug: updated.slug, title: updated.title, featured: updated.featured },
          requestId,
        },
        tx,
      );
      return updated;
    });
    return this.toAdmin(row);
  }

  async adminSetStatus(
    actorId: string,
    id: string,
    to: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT',
    requestId: string,
  ): Promise<AdminArticleDto> {
    const before = await this.prisma.article.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Không tìm thấy bài viết.');
    if (before.status === to) return this.toAdmin(before);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id },
        data: {
          status: to,
          ...(to === 'PUBLISHED' && !before.publishedAt ? { publishedAt: new Date() } : {}),
          updatedBy: actorId,
        },
      });
      await this.audit.record(
        {
          actorId,
          action: `article.${to.toLowerCase()}`,
          entityType: 'article',
          entityId: id,
          before: { status: before.status },
          after: { status: to },
          requestId,
        },
        tx,
      );
      return updated;
    });
    return this.toAdmin(row);
  }

  // ───────────── admin: inquiries (contains PII → support:handle) ─────────────

  async inquiriesList(q: {
    kind?: 'QUOTE' | 'CONTACT' | 'NEWSLETTER' | undefined;
    status?: InquiryStatusCode | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.InquiryWhereInput = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.inquiry.count({ where }),
      this.prisma.inquiry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return new Paginated(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        fullName: r.fullName,
        phone: r.phone,
        email: r.email,
        businessType: r.businessType,
        province: r.province,
        topic: r.topic,
        message: r.message,
        createdAt: r.createdAt,
      })),
      page,
      limit,
      total,
    );
  }

  async inquirySetStatus(
    actorId: string,
    id: string,
    status: InquiryStatusCode,
    requestId: string,
  ) {
    const before = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Không tìm thấy yêu cầu.');
    await this.prisma.$transaction(async (tx) => {
      await tx.inquiry.update({ where: { id }, data: { status, handledBy: actorId } });
      await this.audit.record(
        {
          actorId,
          action: 'inquiry.status',
          entityType: 'inquiry',
          entityId: id,
          before: { status: before.status },
          after: { status },
          requestId,
        },
        tx,
      );
    });
    return { id, status };
  }

  // ───────────── admin: site info (owner settings) ─────────────

  async adminSiteInfoSet(actorId: string, input: unknown, requestId: string): Promise<SiteInfoDto> {
    if (!input || typeof input !== 'object')
      throw new AppError('VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
    const body = input as Record<string, unknown>;
    // Re-use the defensive parser so only well-formed values are persisted.
    const probe = parseSiteInfo(
      new Map<string, unknown>([
        [SETTING_CONTACT, body.contact],
        [SETTING_TIERS, body.wholesaleTiers],
        [SETTING_TIPS, body.guideTips],
      ]),
    );
    const writes: [string, unknown][] = [];
    if (body.contact !== undefined) writes.push([SETTING_CONTACT, probe.contact]);
    if (body.wholesaleTiers !== undefined) writes.push([SETTING_TIERS, probe.wholesaleTiers]);
    if (body.guideTips !== undefined) writes.push([SETTING_TIPS, probe.guideTips]);
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of writes) {
        await tx.setting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue, updatedBy: actorId },
          create: { key, value: value as Prisma.InputJsonValue, updatedBy: actorId },
        });
        await this.audit.record(
          {
            actorId,
            action: 'settings.site_info',
            entityType: 'setting',
            entityId: key,
            after: value,
            requestId,
          },
          tx,
        );
      }
    });
    return this.siteInfo();
  }
}
