import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'Email or Vietnamese mobile number' })
  @IsString()
  @MaxLength(254)
  identity!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  displayName!: string;

  @ApiProperty()
  @IsBoolean()
  acceptTerms!: boolean;
}

export class LoginDto {
  @ApiProperty()
  @IsString()
  @MaxLength(254)
  identity!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: ['CUSTOMER', 'ADMIN', 'FACTORY'], default: 'CUSTOMER' })
  @IsOptional()
  @IsIn(['CUSTOMER', 'ADMIN', 'FACTORY'])
  realm?: 'CUSTOMER' | 'ADMIN' | 'FACTORY';
}

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'Required for bearer (mobile) clients; web uses the refresh cookie',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;

  @ApiPropertyOptional({ enum: ['CUSTOMER', 'ADMIN', 'FACTORY'], default: 'CUSTOMER' })
  @IsOptional()
  @IsIn(['CUSTOMER', 'ADMIN', 'FACTORY'])
  realm?: 'CUSTOMER' | 'ADMIN' | 'FACTORY';
}

export class OtpRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(254)
  identity!: string;

  @ApiProperty({ enum: ['REGISTER_VERIFY'] })
  @IsIn(['REGISTER_VERIFY'])
  purpose!: 'REGISTER_VERIFY';
}

export class OtpVerifyDto extends OtpRequestDto {
  @ApiProperty({ example: '000000', description: '6 digits' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(254)
  identity!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

export class MfaVerifyDto {
  @ApiProperty({ description: '6-digit TOTP or XXXXX-XXXXX recovery code' })
  @IsString()
  @MaxLength(32)
  code!: string;
}
