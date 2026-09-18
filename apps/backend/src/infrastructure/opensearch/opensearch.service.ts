import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { ArticleSearchDocument, buildArticleIndexBody } from './article-index.definition';

export interface BulkItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

@Injectable()
export class OpenSearchService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenSearchService.name);
  readonly client: Client;
  readonly alias: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.alias = config.OPENSEARCH_INDEX_ALIAS;
    this.client = new Client({
      node: config.OPENSEARCH_URL,
      auth:
        config.OPENSEARCH_USERNAME && config.OPENSEARCH_PASSWORD
          ? { username: config.OPENSEARCH_USERNAME, password: config.OPENSEARCH_PASSWORD }
          : undefined,
      requestTimeout: 15_000,
      maxRetries: 1,
    });
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.cluster.health({ timeout: '2s' });
      return res.body.status === 'green' || res.body.status === 'yellow';
    } catch {
      return false;
    }
  }

  async clusterHealth(): Promise<Record<string, unknown> | null> {
    try {
      return (await this.client.cluster.health({ timeout: '2s' })).body as unknown as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async aliasExists(): Promise<boolean> {
    const res = await this.client.indices.existsAlias({ name: this.alias });
    return res.body === true;
  }

  /** Physical indices currently behind the alias. */
  async aliasTargets(): Promise<string[]> {
    try {
      const res = await this.client.indices.getAlias({ name: this.alias });
      return Object.keys(res.body as Record<string, unknown>);
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw err;
    }
  }

  newIndexName(): string {
    return `${this.alias}_v${Date.now()}`;
  }

  async createIndex(name: string): Promise<void> {
    await this.client.indices.create({
      index: name,
      body: buildArticleIndexBody(this.config.OPENSEARCH_REFRESH_INTERVAL) as never,
    });
  }

  /** Creates the first versioned index and points the alias at it if nothing exists yet. */
  async ensureAlias(): Promise<{ created: boolean }> {
    if (await this.aliasExists()) return { created: false };
    // A concrete index named like the alias would block alias creation; that is an operator error.
    const conflicting = await this.client.indices.exists({ index: this.alias });
    if (conflicting.body === true) {
      throw new Error(`An index named "${this.alias}" exists; it must be an alias. Delete it and reindex.`);
    }
    const name = this.newIndexName();
    await this.createIndex(name);
    await this.client.indices.putAlias({ index: name, name: this.alias });
    this.logger.log(`Created index ${name} behind alias ${this.alias}`);
    return { created: true };
  }

  /** Atomically moves the alias to `newIndex` and deletes the indices it pointed to before. */
  async swapAlias(newIndex: string): Promise<string[]> {
    const old = await this.aliasTargets();
    const actions: unknown[] = old.map((index) => ({ remove: { index, alias: this.alias } }));
    actions.push({ add: { index: newIndex, alias: this.alias } });
    await this.client.indices.updateAliases({ body: { actions } as never });
    for (const index of old) {
      if (index !== newIndex) await this.client.indices.delete({ index }).catch(() => undefined);
    }
    return old;
  }

  async bulk(
    index: string,
    upserts: ArticleSearchDocument[],
    deletes: string[],
    refresh = false,
  ): Promise<BulkItemResult[]> {
    if (upserts.length === 0 && deletes.length === 0) return [];
    const body: unknown[] = [];
    for (const doc of upserts) {
      body.push({ index: { _index: index, _id: doc.id } }, doc);
    }
    for (const id of deletes) {
      body.push({ delete: { _index: index, _id: id } });
    }
    const res = await this.client.bulk({ body: body as never, refresh });
    const items = (res.body.items ?? []) as Array<Record<string, { _id: string; status: number; error?: { reason?: string } }>>;
    return items.map((item) => {
      const [op, r] = Object.entries(item)[0];
      // Deleting a document that is not in the index is fine: the goal state is reached.
      const ok = r.status < 300 || (op === 'delete' && r.status === 404);
      return { id: String(r._id), ok, error: ok ? undefined : (r.error?.reason ?? `status ${r.status}`) };
    });
  }

  async refresh(index?: string): Promise<void> {
    await this.client.indices.refresh({ index: index ?? this.alias });
  }

  async count(): Promise<number | null> {
    try {
      const res = await this.client.count({ index: this.alias });
      return Number(res.body.count);
    } catch {
      return null;
    }
  }

  isNotFound(err: unknown): boolean {
    return (err as { meta?: { statusCode?: number } })?.meta?.statusCode === 404;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [OpenSearchService], exports: [OpenSearchService] })
export class OpenSearchModule {}
