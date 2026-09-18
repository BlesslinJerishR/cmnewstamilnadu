import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { CacheModule } from './infrastructure/cache/cache.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { OpenSearchModule } from './infrastructure/opensearch/opensearch.service';
import { QueueModule } from './infrastructure/queue/queue.service';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AdminController } from './modules/admin/admin.controller';
import { BookmarksController, BookmarksService } from './modules/bookmarks/bookmarks.controller';
import { CategoriesService } from './modules/categories/categories.service';
import { DeduplicationService } from './modules/deduplication/deduplication.service';
import { FeedController } from './modules/feed/feed.controller';
import { FeedService } from './modules/feed/feed.service';
import { GdeltDocClient } from './modules/gdelt/gdelt-doc.client';
import { GdeltGkgClient } from './modules/gdelt/gdelt-gkg.client';
import { HealthController } from './modules/health/health.controller';
import { IndexingService } from './modules/indexing/indexing.service';
import { IngestionService } from './modules/ingestion/ingestion.service';
import { MaintenanceService } from './modules/maintenance/maintenance.service';
import { MetricsController } from './modules/metrics/metrics.controller';
import { MetricsService } from './modules/metrics/metrics.service';
import { NewsController } from './modules/news/news.controller';
import { NewsService } from './modules/news/news.service';
import { NichesService } from './modules/niches/niches.service';
import { ArticleProcessorService } from './modules/processing/article-processor.service';
import { SearchService } from './modules/search/search.service';
import { SourcesService } from './modules/sources/sources.service';
import { AuthController } from './modules/users/auth.controller';
import { AdminGuard, AuthGuard } from './modules/users/auth.guard';
import { UsersService } from './modules/users/users.service';

/** Infrastructure shared by the API and the worker process. */
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, QueueModule, OpenSearchModule, CacheModule],
})
export class InfrastructureModule {}

/**
 * Domain services. Kept in one module on purpose (modular monolith): each service lives in its
 * own folder with no circular imports, so any of them can later move to a separate service.
 * Dependency direction: gdelt -> processing (normalize/relevance/dedup/quality/categories)
 * -> PostgreSQL + outbox -> indexing -> OpenSearch; news/search/feed only read.
 */
@Module({
  imports: [InfrastructureModule],
  providers: [
    NichesService,
    SourcesService,
    CategoriesService,
    DeduplicationService,
    ArticleProcessorService,
    GdeltDocClient,
    GdeltGkgClient,
    IngestionService,
    IndexingService,
    MaintenanceService,
    NewsService,
    SearchService,
    FeedService,
    UsersService,
    BookmarksService,
    AuthGuard,
    AdminGuard,
  ],
  exports: [
    NichesService,
    SourcesService,
    CategoriesService,
    DeduplicationService,
    ArticleProcessorService,
    GdeltDocClient,
    GdeltGkgClient,
    IngestionService,
    IndexingService,
    MaintenanceService,
    NewsService,
    SearchService,
    FeedService,
    UsersService,
    BookmarksService,
    AuthGuard,
    AdminGuard,
  ],
})
export class DomainModule {}

/** HTTP API process. */
@Module({
  imports: [InfrastructureModule, DomainModule],
  controllers: [
    HealthController,
    MetricsController,
    NewsController,
    FeedController,
    AuthController,
    BookmarksController,
    AdminController,
  ],
  providers: [MetricsService],
})
export class AppModule {}
