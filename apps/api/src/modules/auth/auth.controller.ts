import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { Actor } from '../../common/decorators/actor.decorator';

const isProd = process.env.NODE_ENV === 'production';
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
// Refresh cookie is scoped to the auth routes so it isn't sent on every request.
const REFRESH_PATH = '/api/v1/auth';
const base = { httpOnly: true as const, secure: isProd, sameSite: 'lax' as const };

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  // The JWT inside expires in 15m (enforced by the API); the cookie itself lives as
  // long as the refresh so route-gating sees a session and the client silently refreshes.
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: 14 * 24 * 3600 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: REFRESH_PATH, maxAge: 14 * 24 * 3600 * 1000 });
}
function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}
function reqCtx(req: Request) {
  return {
    ua: req.headers['user-agent'],
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.auth.login(body?.email ?? '', body?.password ?? '', reqCtx(req));
    setAuthCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as any).cookies?.[REFRESH_COOKIE];
    try {
      const { user, accessToken, refreshToken } = await this.auth.refresh(raw, reqCtx(req));
      setAuthCookies(res, accessToken, refreshToken);
      return { user };
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req as any).cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  async logoutAll(@Actor() actorId: string | null, @Res({ passthrough: true }) res: Response) {
    if (actorId) await this.auth.logoutAll(actorId);
    clearAuthCookies(res);
    return { ok: true };
  }

  @Get('me')
  me(@Actor() actorId: string | null) {
    return this.auth.me(actorId!);
  }

  @Post('password/change')
  changePassword(@Actor() actorId: string | null, @Body() body: { currentPassword?: string; newPassword?: string }) {
    return this.auth.changePassword(actorId!, body?.currentPassword ?? '', body?.newPassword ?? '');
  }
}
