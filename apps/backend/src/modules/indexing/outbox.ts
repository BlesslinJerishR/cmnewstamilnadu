import { Queryable } from '../../infrastructure/database/database.service';

/**
 * Records that an article's search representation must be refreshed. Always call this inside
 * the same transaction as the article change: if the transaction commits, the outbox row
 * exists, so a crash before the indexing job runs can never lose the update.
 */
export async function writeOutbox(tx: Queryable, articleIds: Array<string | number>): Promise<void> {
  if (articleIds.length === 0) return;
  await tx.query('INSERT INTO search_outbox (article_id) SELECT unnest($1::bigint[])', [articleIds.map(String)]);
}
