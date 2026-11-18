import { Body, Controller, HttpCode, Get, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SessionRealm } from '@bizgo/shared';
import { AppError } from '@bizgo/shared';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuthService, type LoginResult } from './auth.service';
import { cookieNames, type AuthContext, type AuthedRequest } from './auth.types';
import { AllowPendingMfa, CurrentAuth, Public, Realm, RequestMeta, SkipCsrf } from './decorators';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  MfaVerifyDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { MfaService } from './mfa.service';
import type { IssuedTokens } from './session.service';

type Meta = { ip: string | null; ua: string | null; requestId: string };

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Mobile/bearer clients announce themselves; they get tokens in the body, web gets cookies only. */
  private isBearerClient(req: AuthedRequest): boolean {
    return req.header('x-client') === 'mobile';
  }

  private setCookies(res: Response, realm: SessionRealm, t: IssuedTokens): void {
    const names = cookieNames(realm);
    const base = {
      secure: this.config.cookieSecure,
      sameSite: 'lax' as const,
      path: '/',
      ...(this.config.COOKIE_DOMAIN ? { domain: this.config.COOKIE_DOMAIN } : {}),
    };
    res.cookie(names.access, t.accessToken, {
      ...base,
      httpOnly: true,
      expires: t.accessExpiresAt,
    });
    res.cookie(names.refresh, t.refreshToken, {
      ...base,
      httpOnly: true,
      path: '/v1/auth',
      expires: t.refreshExpiresAt,
    });
    // Readable by the SPA so it can echo it in X-CSRF-Token (double submit, bound to the session).
    res.cookie(names.csrf, t.csrfToken, { ...base, httpOnly: false, expires: t.refreshExpiresAt });
  }

  private clearCookies(res: Response, realm: SessionRealm): void {
    const names = cookieNames(realm);
    res.clearCookie(names.access, { path: '/' });
    res.clearCookie(names.refresh, { path: '/v1/auth' });
    res.clearCookie(names.csrf, { path: '/' });
  }

  private loginBody(req: AuthedRequest, result: LoginResult) {
    return {
      user: result.user,
      mfa: result.mfa,
      csrfToken: result.tokens.csrfToken,
      expiresAt: result.tokens.accessExpiresAt,
      ...(this.isBearerClient(req)
        ? { accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken }
        : {}),
    };
  }

  @Public()
  @SkipCsrf()
  @Post('register')
  @ApiOperation({ summary: 'Register account (requires OTP verification before login)' })
  register(@Body() dto: RegisterDto, @RequestMeta() meta: Meta) {
    return this.auth.register(dto, meta);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(200)
  @Post('login')
  @ApiOperation({
    summary: 'Login (rate limited). Cookies for web; tokens in body for X-Client: mobile',
  })
  async login(
    @Body() dto: LoginDto,
    @RequestMeta() meta: Meta,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const realm = dto.realm ?? 'CUSTOMER';
    const result = await this.auth.login(
      { identity: dto.identity, password: dto.password, realm },
      meta,
    );
    this.setCookies(res, realm, result.tokens);
    return this.loginBody(req, result);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(200)
  @Post('refresh')
  @Realm('CUSTOMER', 'ADMIN', 'FACTORY')
  @ApiOperation({ summary: 'Rotate refresh token (reuse detection revokes the whole family)' })
  async refresh(
    @Body() dto: RefreshDto,
    @RequestMeta() meta: Meta,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const realm = dto.realm ?? 'CUSTOMER';
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
    const token = dto.refreshToken ?? cookies[cookieNames(realm).refresh];
    if (!token)
      throw new AppError('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    const result = await this.auth.refresh(token, [realm], meta);
    this.setCookies(res, result.user.realm, result.tokens);
    return this.loginBody(req, result);
  }

  @Post('logout')
  @HttpCode(200)
  @Realm('CUSTOMER', 'ADMIN', 'FACTORY')
  @AllowPendingMfa()
  @ApiBearerAuth()
  async logout(
    @CurrentAuth() auth: AuthContext,
    @RequestMeta() meta: Meta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(auth.familyId, auth.userId, meta);
    this.clearCookies(res, auth.realm);
    return { loggedOut: true };
  }

  @Get('session')
  @Realm('CUSTOMER', 'ADMIN', 'FACTORY')
  @AllowPendingMfa()
  @ApiOperation({
    summary: 'Current session summary (realm, roles, MFA state). UX only; API stays the authority.',
  })
  async session(@CurrentAuth() auth: AuthContext) {
    return this.auth.summary(auth.userId, auth.realm, auth.sessionId);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(200)
  @Post('otp/request')
  @ApiOperation({
    summary: 'Request OTP (503 OTP_DELIVERY_NOT_CONFIGURED until provider approved, D15)',
  })
  otpRequest(@Body() dto: OtpRequestDto, @RequestMeta() meta: Meta) {
    return this.auth.requestOtp(dto, meta);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(200)
  @Post('otp/resend')
  @ApiOperation({ summary: 'Resend OTP (cooldown + hourly cap)' })
  otpResend(@Body() dto: OtpRequestDto, @RequestMeta() meta: Meta) {
    return this.auth.requestOtp(dto, meta);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(200)
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP (TTL 5 min, max 5 attempts)' })
  otpVerify(@Body() dto: OtpVerifyDto, @RequestMeta() meta: Meta) {
    return this.auth.verifyOtp(dto, meta);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(202)
  @Post('password/forgot')
  @ApiOperation({ summary: 'Non-enumerating password recovery request (always 202)' })
  forgot(@Body() dto: ForgotPasswordDto, @RequestMeta() meta: Meta) {
    return this.auth.forgotPassword(dto, meta);
  }

  @Public()
  @SkipCsrf()
  @HttpCode(200)
  @Post('password/reset')
  @ApiOperation({ summary: 'Reset with one-use token; revokes all sessions' })
  async reset(@Body() dto: ResetPasswordDto, @RequestMeta() meta: Meta) {
    await this.auth.resetPassword(dto, meta);
    return { reset: true };
  }

  @Post('password/change')
  @HttpCode(200)
  @Realm('CUSTOMER', 'ADMIN', 'FACTORY')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (re-auth with current); revokes other sessions' })
  async change(
    @Body() dto: ChangePasswordDto,
    @CurrentAuth() auth: AuthContext,
    @RequestMeta() meta: Meta,
  ) {
    await this.auth.changePassword(auth.userId, auth.familyId, dto, meta);
    return { changed: true };
  }

  @Post('mfa/enroll')
  @HttpCode(200)
  @Realm('ADMIN', 'FACTORY')
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Start TOTP enrolment for privileged roles (secret shown once)' })
  async mfaEnroll(@CurrentAuth() auth: AuthContext) {
    return this.mfa.enroll(auth.userId, auth.displayName);
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @Realm('ADMIN', 'FACTORY')
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Verify TOTP or recovery code; first success confirms enrolment' })
  async mfaVerify(
    @Body() dto: MfaVerifyDto,
    @CurrentAuth() auth: AuthContext,
    @RequestMeta() meta: Meta,
  ) {
    const r = await this.mfa.verify({
      userId: auth.userId,
      sessionId: auth.sessionId,
      code: dto.code,
      requestId: meta.requestId,
    });
    return {
      verified: true,
      verifiedAt: r.verifiedAt,
      ...(r.recoveryCodes ? { recoveryCodes: r.recoveryCodes } : {}),
    };
  }
}
