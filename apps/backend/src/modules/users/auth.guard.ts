import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, UsersService } from './users.service';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

function bearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const token = bearer(req);
    const user = token ? await this.users.authenticate(token) : null;
    if (!user) throw new UnauthorizedException({ code: 'unauthorized', message: 'Authentication required' });
    req.user = user;
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const token = bearer(req);
    const user = token ? await this.users.authenticate(token) : null;
    if (!user) throw new UnauthorizedException({ code: 'unauthorized', message: 'Authentication required' });
    if (user.role !== 'admin') throw new ForbiddenException({ code: 'forbidden', message: 'Administrator access required' });
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  return ctx.switchToHttp().getRequest<RequestWithUser>().user!;
});
