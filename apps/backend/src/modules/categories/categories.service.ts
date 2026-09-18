import { Injectable } from '@nestjs/common';
import type { Category } from '@cmnews/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly db: DatabaseService) {}

  async listPublic(): Promise<Category[]> {
    const rows = await this.db.query<{ slug: string; name: string; description: string | null; is_feed_section: boolean }>(
      'SELECT slug, name, description, is_feed_section FROM categories WHERE enabled ORDER BY sort_order, name',
    );
    return rows.map((r) => ({ slug: r.slug, name: r.name, description: r.description, isFeedSection: r.is_feed_section }));
  }

  async exists(slug: string): Promise<boolean> {
    return (await this.db.one('SELECT 1 FROM categories WHERE slug = $1 AND enabled', [slug])) !== null;
  }
}
