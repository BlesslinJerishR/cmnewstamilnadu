import { Logger, LogLevel } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from './config/app-config';
import { runMigrations } from './infrastructure/database/migrator';

export function logLevels(level: AppConfig['LOG_LEVEL']): LogLevel[] {
  const order: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  return order.slice(0, order.indexOf(level) + 1);
}

/** Applies pending migrations (serialised by an advisory lock, so API and worker can both call it). */
export async function migrate(config: AppConfig): Promise<void> {
  const logger = new Logger('Migrations');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const applied = await runMigrations(pool, (m) => logger.log(m));
        if (applied.length) logger.log(`Applied ${applied.length} migration(s)`);
        return;
      } catch (err) {
        const msg = (err as Error).message;
        // Retry only while PostgreSQL is still starting; a failing migration is fatal.
        if (attempt >= 30 || msg.startsWith('Migration ')) throw err;
        logger.warn(`PostgreSQL not ready (${msg}); retrying in 2s`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } finally {
    await pool.end();
  }
}
