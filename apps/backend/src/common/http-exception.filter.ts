import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
  503: 'service_unavailable',
};

/** Uniform error body: { error: { code, message, details? } }. Internal details never leak. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = CODES[status] ?? `http_${status}`;
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { code?: string; message?: string | string[]; details?: unknown };
        if (b.code) code = b.code;
        if (b.message) message = Array.isArray(b.message) ? b.message.join('; ') : b.message;
        details = b.details;
      }
    } else if ((exception as { statusCode?: number })?.statusCode === 429) {
      status = 429;
      code = 'rate_limited';
      message = 'Too many requests';
    } else {
      this.logger.error(
        `${request.method} ${request.url} failed: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }
    void reply.status(status).send({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
  }
}
