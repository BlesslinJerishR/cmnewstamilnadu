import { BadRequestException } from '@nestjs/common';

/** Opaque, URL-safe pagination cursors. Clients must never construct or parse them. */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined, guard: (v: unknown) => v is T): T | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (guard(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw new BadRequestException({ code: 'invalid_cursor', message: 'Invalid pagination cursor' });
}

export interface TimeCursor {
  p: string;
  i: string;
}

export const isTimeCursor = (v: unknown): v is TimeCursor =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as TimeCursor).p === 'string' &&
  !Number.isNaN(Date.parse((v as TimeCursor).p)) &&
  typeof (v as TimeCursor).i === 'string' &&
  /^\d{1,19}$/.test((v as TimeCursor).i);
