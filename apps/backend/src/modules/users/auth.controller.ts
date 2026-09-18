import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthResponse, UserProfile } from '@cmnews/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, CurrentUser } from './auth.guard';
import { AuthenticatedUser, UsersService } from './users.service';

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10, 'password must have at least 10 characters').max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

@Controller()
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Post('auth/register')
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: z.infer<typeof registerSchema>,
    @Req() req: FastifyRequest,
  ): Promise<AuthResponse> {
    return this.users.register(body.email, body.password, body.displayName ?? null, req.headers['user-agent'] ?? null);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: FastifyRequest): Promise<AuthResponse> {
    return this.users.login(body.email, body.password, req.headers['user-agent'] ?? null);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.users.logout(user.sessionId);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): UserProfile {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }
}
