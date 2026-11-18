import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AllowOutOfShift, CurrentUser, Public, type AuthUser } from '../common/decorators';
import { parse } from '../common/parse';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from '@erp/shared';
import { AuthService } from '../services/auth.service';
import { config } from '../common/config';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const data = parse(loginSchema, body);
    const user = await this.auth.validate(data.email, data.password);
    const token = this.auth.tokenFor(user);
    const csrfToken = this.auth.csrfToken();
    const cookieOptions = {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax' as const,
      maxAge: 12 * 60 * 60 * 1000,
    };
    res.cookie('erp_token', token, cookieOptions);
    res.cookie('erp_csrf', csrfToken, {
      httpOnly: false,
      secure: config.isProduction,
      sameSite: 'lax' as const,
      maxAge: 12 * 60 * 60 * 1000,
    });
    return { user: await this.auth.me(user.id), csrfToken };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('erp_token');
    res.clearCookie('erp_csrf');
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @AllowOutOfShift()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const data = parse(changePasswordSchema, body);
    await this.auth.changePassword(user.id, data.currentPassword, data.newPassword);
    return { ok: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown) {
    const data = parse(forgotPasswordSchema, body);
    return this.auth.requestPasswordReset(data.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    const data = parse(resetPasswordSchema, body);
    return this.auth.resetPassword(data.token, data.newPassword);
  }
}
