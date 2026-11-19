import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ARTICLE_CATEGORIES = [
  'RECIPE',
  'INGREDIENT',
  'BUSINESS',
  'STORAGE',
  'WHOLESALE',
] as const;
export const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const INQUIRY_KINDS = ['QUOTE', 'CONTACT', 'NEWSLETTER'] as const;
export const INQUIRY_STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'SPAM'] as const;
export const INQUIRY_TOPICS = [
  'QUOTE',
  'WHOLESALE_AGENT',
  'PRODUCT_ADVICE',
  'ORDER_SUPPORT',
  'PARTNERSHIP',
  'OTHER',
] as const;
export const BUSINESS_TYPES = [
  'MILK_TEA_SHOP',
  'DESSERT_SHOP',
  'SNACK_SHOP',
  'DISTRIBUTOR',
  'AGENT',
  'OTHER',
] as const;

const asBool = (v: unknown) => (v === 'true' || v === true ? true : v === 'false' ? false : v);
const asInt = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COVER = /^(\/[A-Za-z0-9._\-/]+|https:\/\/[^\s]+)$/;

class PageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => asInt(value))
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @ApiPropertyOptional({ maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => asInt(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PublicArticlesQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ARTICLE_CATEGORIES })
  @IsOptional()
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category?: (typeof ARTICLE_CATEGORIES)[number];

  @ApiPropertyOptional({ description: 'Only featured articles' })
  @IsOptional()
  @Transform(({ value }) => asBool(value))
  @IsBoolean()
  featured?: boolean;
}

export class AdminArticlesQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ARTICLE_STATUSES })
  @IsOptional()
  @IsIn(ARTICLE_STATUSES as unknown as string[])
  status?: (typeof ARTICLE_STATUSES)[number];

  @ApiPropertyOptional({ enum: ARTICLE_CATEGORIES })
  @IsOptional()
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category?: (typeof ARTICLE_CATEGORIES)[number];
}

export class ArticleCreateDto {
  @ApiProperty() @IsString() @Length(5, 160) title!: string;
  @ApiPropertyOptional({ description: 'Lowercase-hyphen; generated from the title when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG, { message: 'slug must be lowercase letters, digits and hyphens' })
  slug?: string;
  @ApiProperty() @IsString() @Length(10, 300) excerpt!: string;
  @ApiProperty({ description: 'Plain text: blank line = paragraph, "## " heading, "- " bullet' })
  @IsString()
  @Length(20, 20_000)
  body!: string;
  @ApiProperty({ enum: ARTICLE_CATEGORIES })
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category!: (typeof ARTICLE_CATEGORIES)[number];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(COVER, { message: 'coverImage must be a site path or an https URL' })
  coverImage?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() featured?: boolean;
}

export class ArticleUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 160) title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG, { message: 'slug must be lowercase letters, digits and hyphens' })
  slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 300) excerpt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(20, 20_000) body?: string;
  @ApiPropertyOptional({ enum: ARTICLE_CATEGORIES })
  @IsOptional()
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category?: (typeof ARTICLE_CATEGORIES)[number];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(COVER, { message: 'coverImage must be a site path or an https URL' })
  coverImage?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() featured?: boolean;
}

/** Public lead form. `website` is a honeypot: real users never fill it. */
export class InquiryCreateDto {
  @ApiProperty({ enum: INQUIRY_KINDS })
  @IsIn(INQUIRY_KINDS as unknown as string[])
  kind!: (typeof INQUIRY_KINDS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @ApiPropertyOptional({ description: 'Vietnamese mobile number' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}$/, {
    message: 'phone must be a Vietnamese phone number',
  })
  phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @ApiPropertyOptional({ enum: BUSINESS_TYPES })
  @IsOptional()
  @IsIn(BUSINESS_TYPES as unknown as string[])
  businessType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) province?: string;
  @ApiPropertyOptional({ enum: INQUIRY_TOPICS })
  @IsOptional()
  @IsIn(INQUIRY_TOPICS as unknown as string[])
  topic?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 2000) message?: string;
  @ApiProperty({ description: 'Consent to be contacted / to receive email (must be true)' })
  @IsBoolean()
  consent!: boolean;
  @ApiPropertyOptional({ description: 'Honeypot — leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class AdminInquiriesQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: INQUIRY_KINDS })
  @IsOptional()
  @IsIn(INQUIRY_KINDS as unknown as string[])
  kind?: (typeof INQUIRY_KINDS)[number];
  @ApiPropertyOptional({ enum: INQUIRY_STATUSES })
  @IsOptional()
  @IsIn(INQUIRY_STATUSES as unknown as string[])
  status?: (typeof INQUIRY_STATUSES)[number];
}

export class InquiryStatusDto {
  @ApiProperty({ enum: INQUIRY_STATUSES })
  @IsIn(INQUIRY_STATUSES as unknown as string[])
  status!: (typeof INQUIRY_STATUSES)[number];
}
