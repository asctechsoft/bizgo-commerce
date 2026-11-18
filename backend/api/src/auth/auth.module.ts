import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DevConsoleTransport, MessageTransport, UnconfiguredTransport } from './message-transport';
import { MfaService } from './mfa.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    PasswordService,
    SessionService,
    OtpService,
    MfaService,
    AuthService,
    DevConsoleTransport,
    UnconfiguredTransport,
    {
      // Real providers are blocked on D15. Dev console only when explicitly enabled outside production.
      provide: MessageTransport,
      inject: [APP_CONFIG, DevConsoleTransport, UnconfiguredTransport],
      useFactory: (config: AppConfig, dev: DevConsoleTransport, none: UnconfiguredTransport) =>
        config.DEV_OTP_CONSOLE && !config.isProduction ? dev : none,
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, PasswordService, AuthService, MessageTransport, DevConsoleTransport],
})
export class AuthModule {}
