import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Permission } from '@bizgo/shared';
import { CurrentAuth, Realm } from '../auth/decorators';
import type { AuthContext } from '../auth/auth.types';
import { MeService } from './me.service';

class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  displayName?: string;
}

class AddressBodyDto {
  @ApiProperty() @IsString() @Length(2, 100) receiverName!: string;
  @ApiProperty()
  @IsString()
  @Matches(/^(\+?84|0)\d{9}$/, { message: 'phone must be a Vietnamese mobile number' })
  phone!: string;
  @ApiProperty() @IsString() @Length(1, 100) province!: string;
  @ApiProperty() @IsString() @Length(1, 100) district!: string;
  @ApiProperty() @IsString() @Length(1, 100) ward!: string;
  @ApiProperty() @IsString() @Length(1, 255) detail!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

class AddressPatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 100) receiverName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^(\+?84|0)\d{9}$/) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) province?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) district?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) ward?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) detail?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

@ApiTags('Me')
@ApiBearerAuth()
@Realm('CUSTOMER')
@Controller('v1/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentAuth() auth: AuthContext) {
    return this.me.profile(auth.userId);
  }

  @Patch()
  update(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(auth.userId, dto);
  }

  /** UX gating only; every API call re-checks permissions server-side. */
  @Get('permissions')
  permissions(@CurrentAuth() auth: AuthContext): { roles: string[]; permissions: Permission[] } {
    return { roles: auth.roles, permissions: [...auth.permissions].sort() };
  }

  @Get('addresses')
  addresses(@CurrentAuth() auth: AuthContext) {
    return this.me.listAddresses(auth.userId);
  }

  @Post('addresses')
  create(@CurrentAuth() auth: AuthContext, @Body() dto: AddressBodyDto) {
    return this.me.createAddress(auth.userId, dto);
  }

  @Patch('addresses/:id')
  patch(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddressPatchDto,
  ) {
    return this.me.updateAddress(auth.userId, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(200)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.me.deleteAddress(auth.userId, id);
    return { deleted: true };
  }
}
