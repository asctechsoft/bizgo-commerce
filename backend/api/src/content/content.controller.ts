import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import {
  CurrentAuth,
  Public,
  Realm,
  RequestMeta,
  RequirePermissions,
  SkipCsrf,
} from '../auth/decorators';
import {
  AdminArticlesQueryDto,
  AdminInquiriesQueryDto,
  ArticleCreateDto,
  ArticleUpdateDto,
  InquiryCreateDto,
  InquiryStatusDto,
  PublicArticlesQueryDto,
} from './content.dto';
import { ContentService } from './content.service';

type Meta = { ip: string | null; ua: string | null; requestId: string };

@ApiTags('Content')
@Public()
@Realm('CUSTOMER')
@Controller('v1')
export class PublicContentController {
  constructor(private readonly content: ContentService) {}

  @Get('articles')
  @ApiOperation({ summary: 'Published guide articles (query: category, featured, page, limit)' })
  list(@Query() q: PublicArticlesQueryDto) {
    return this.content.listPublic(q);
  }

  @Get('articles/:slug')
  @ApiOperation({ summary: 'Published article by slug (404 for draft/archived/unknown)' })
  get(@Param('slug') slug: string) {
    return this.content.getPublic(slug);
  }

  @Get('site/info')
  @ApiOperation({
    summary:
      'Owner-managed contact info, wholesale tiers and guide tips (null/empty when not configured)',
  })
  siteInfo() {
    return this.content.siteInfo();
  }

  @Post('inquiries')
  @SkipCsrf()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Public lead form: B2B quote, contact or newsletter signup (rate limited)',
  })
  inquire(@Body() dto: InquiryCreateDto, @RequestMeta() m: Meta) {
    return this.content.createInquiry(dto, { ip: m.ip, requestId: m.requestId });
  }
}

@ApiTags('Admin Content')
@ApiBearerAuth()
@Realm('ADMIN')
@Controller('v1/admin')
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get('articles')
  @RequirePermissions('content:write')
  articles(@Query() q: AdminArticlesQueryDto) {
    return this.content.adminList(q);
  }

  @Get('articles/:id')
  @RequirePermissions('content:write')
  article(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.content.adminGet(id);
  }

  @Post('articles')
  @RequirePermissions('content:write')
  createArticle(
    @CurrentAuth() a: AuthContext,
    @Body() dto: ArticleCreateDto,
    @RequestMeta() m: Meta,
  ) {
    return this.content.adminCreate(a.userId, dto, m.requestId);
  }

  @Patch('articles/:id')
  @RequirePermissions('content:write')
  updateArticle(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ArticleUpdateDto,
    @RequestMeta() m: Meta,
  ) {
    return this.content.adminUpdate(a.userId, id, dto, m.requestId);
  }

  @Post('articles/:id/publish')
  @HttpCode(200)
  @RequirePermissions('content:write')
  publish(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @RequestMeta() m: Meta,
  ) {
    return this.content.adminSetStatus(a.userId, id, 'PUBLISHED', m.requestId);
  }

  @Post('articles/:id/archive')
  @HttpCode(200)
  @RequirePermissions('content:write')
  archive(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @RequestMeta() m: Meta,
  ) {
    return this.content.adminSetStatus(a.userId, id, 'ARCHIVED', m.requestId);
  }

  @Get('inquiries')
  @RequirePermissions('support:handle')
  inquiries(@Query() q: AdminInquiriesQueryDto) {
    return this.content.inquiriesList(q);
  }

  @Post('inquiries/:id/status')
  @HttpCode(200)
  @RequirePermissions('support:handle')
  inquiryStatus(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InquiryStatusDto,
    @RequestMeta() m: Meta,
  ) {
    return this.content.inquirySetStatus(a.userId, id, dto.status, m.requestId);
  }

  @Put('site/info')
  @RequirePermissions('settings:write')
  setSiteInfo(@CurrentAuth() a: AuthContext, @Body() body: unknown, @RequestMeta() m: Meta) {
    return this.content.adminSiteInfoSet(a.userId, body, m.requestId);
  }
}
