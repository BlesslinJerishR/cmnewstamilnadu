import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

// Return NUMERIC columns as JS numbers (scores are small, fixed precision values).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
}

class ClientQueryable implements Queryable {
  constructor(private readonly client: PoolClient) {}
  async query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
    const res = await this.client.query<T>(text, params as unknown[]);
    return res.rows;
  }
}

@Injectable()
export class DatabaseService implements Queryable, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      application_name: 'cmnews',
    });
    this.pool.on('error', (err) => this.logger.error(`Idle PostgreSQL client error: ${err.message}`));
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
    const res = await this.pool.query<T>(text, params as unknown[]);
    return res.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new ClientQueryable(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
