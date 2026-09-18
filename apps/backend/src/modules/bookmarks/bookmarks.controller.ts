import { Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { BookmarkItem, Paginated } from '@cmnews/shared';
import { decodeCursor, encodeCursor, isTimeCursor } from '../../common/cursor';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { SUMMARY_COLUMNS, SummaryRow, toSummary } from '../news/news.service';
import { idParamSchema, limitSchema } from '../news/news.schemas';
import { AuthGuard, CurrentUser } from '../users/auth.guard';
import { AuthenticatedUser } from '../users/users.service';

const listSchema = z.object({ cursor: z.string().max(512).optional(), limit: limitSchema });
const importSchema = z.object({ articleIds: z.array(idParamSchema).max(500) });
const MAX_BOOKMARKS = 5000;

@Injectable()
export class BookmarksService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string, cursorStr: string | undefined, limit: number): Promise<Paginated<BookmarkItem>> {
    const cursor = decodeCursor(cursorStr, isTimeCursor);
    const rows = await this.db.query<SummaryRow & { bookmarked_at: Date }>(
      `SELECT ${SUMMARY_COLUMNS}, b.created_at AS bookmarked_at
         FROM bookmarks b JOIN articles a ON a.id = b.article_id AND a.status = 'accepted'
        WHERE b.user_id = $1
          AND ($2::timestamptz IS NULL OR (b.created_at, b.article_id) < ($2::timestamptz, $3::bigint))
        ORDER BY b.created_at DESC, b.article_id DESC
        LIMIT $4`,
      [userId, cursor?.p ?? null, cursor?.i ?? '0', limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({ article: toSummary(r), bookmarkedAt: new Date(r.bookmarked_at).toISOString() })),
      nextCursor: rows.length > limit && last ? encodeCursor({ p: new Date(last.bookmarked_at).toISOString(), i: String(last.id) }) : null,
    };
  }

  async add(userId: string, articleIds: string[]): Promise<number> {
    const [{ count }] = await this.db.query<{ count: string }>('SELECT count(*) FROM bookmarks WHERE user_id = $1', [userId]);
    if (Number(count) + articleIds.length > MAX_BOOKMARKS) {
      throw new ConflictException({ code: 'bookmark_limit', message: `At most ${MAX_BOOKMARKS} bookmarks are allowed` });
    }
    const rows = await this.db.query(
      `INSERT INTO bookmarks (user_id, article_id)
       SELECT $1, a.id FROM articles a WHERE a.id = ANY($2::bigint[]) AND a.status = 'accepted'
       ON CONFLICT DO NOTHING RETURNING article_id`,
      [userId, articleIds],
    );
    return rows.length;
  }

  async isPublicArticle(articleId: string): Promise<boolean> {
    return (await this.db.one(`SELECT 1 FROM articles WHERE id = $1 AND status = 'accepted'`, [articleId])) !== null;
  }

  async remove(userId: string, articleId: string): Promise<void> {
    await this.db.query('DELETE FROM bookmarks WHERE user_id = $1 AND article_id = $2', [userId, articleId]);
  }
}

@Controller('me/bookmarks')
@UseGuards(AuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return this.bookmarks.list(user.id, q.cursor, q.limit);
  }

  @Put(':articleId')
  @HttpCode(204)
  async add(@CurrentUser() user: AuthenticatedUser, @Param('articleId', new ZodValidationPipe(idParamSchema)) articleId: string) {
    if (!(await this.bookmarks.isPublicArticle(articleId))) {
      throw new NotFoundException({ code: 'article_not_found', message: 'Article not found' });
    }
    await this.bookmarks.add(user.id, [articleId]);
  }

  @Delete(':articleId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('articleId', new ZodValidationPipe(idParamSchema)) articleId: string) {
    await this.bookmarks.remove(user.id, articleId);
  }

  /** Merges bookmarks saved on the device before the user signed in. */
  @Post('import')
  async import(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(importSchema)) body: z.infer<typeof importSchema>) {
    return { imported: await this.bookmarks.add(user.id, [...new Set(body.articleIds)]) };
  }
}
