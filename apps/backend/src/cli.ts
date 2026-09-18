import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DomainModule, InfrastructureModule } from './app.module';
import { migrate } from './bootstrap';
import { loadConfig } from './config/app-config';
import { DatabaseService } from './infrastructure/database/database.service';
import { IndexingService } from './modules/indexing/indexing.service';
import { BackfillStrategy, IngestionService, parseDayBoundary } from './modules/ingestion/ingestion.service';
import { MaintenanceService } from './modules/maintenance/maintenance.service';
import { NichesService } from './modules/niches/niches.service';
import { UsersService } from './modules/users/users.service';
import { Module } from '@nestjs/common';

@Module({ imports: [InfrastructureModule, DomainModule] })
class CliModule {}

const USAGE = `Usage: node dist/cli.js <command> [options]

Commands:
  migrate                                  Apply database migrations
  seed                                     Insert the default niche, queries, rules, categories, sources
  create-admin --email <email>             Create/promote an admin (password from ADMIN_PASSWORD env)
  backfill --from <date> --to <date>       Queue a historical backfill (dates in IST, YYYY-MM-DD)
           [--strategy auto|doc|gkg] [--niche tn-cm]
  backfill-status                          Show backfill progress
  backfill-resume --id <id>                Re-queue unfinished and failed slices of a backfill
  ingest-now                               Queue one ingestion cycle immediately
  reindex                                  Rebuild the OpenSearch index from PostgreSQL (runs inline)
  rescore                                  Re-apply relevance/category rules to all articles (inline)
  retention                                Run retention cleanup now (inline)
`;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return;
  }
  const config = loadConfig();
  await migrate(config);
  if (command === 'migrate') return;

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn', 'log'] });
  try {
    await app.get(NichesService).seed();
    switch (command) {
      case 'seed':
        console.log('Seed complete');
        break;
      case 'create-admin': {
        const email = arg(args, 'email');
        const password = process.env.ADMIN_PASSWORD;
        if (!email || !password || password.length < 12) {
          throw new Error('create-admin needs --email and an ADMIN_PASSWORD environment variable of at least 12 characters');
        }
        await app.get(UsersService).upsertAdmin(email, password);
        console.log(`Admin ${email} ready`);
        break;
      }
      case 'backfill': {
        const from = arg(args, 'from');
        const to = arg(args, 'to');
        const strategy = (arg(args, 'strategy') ?? 'auto') as BackfillStrategy;
        if (!from || !to || !['auto', 'doc', 'gkg'].includes(strategy)) throw new Error('backfill needs --from and --to (YYYY-MM-DD)');
        const result = await app
          .get(IngestionService)
          .createBackfill(arg(args, 'niche') ?? config.DEFAULT_NICHE, parseDayBoundary(from, 'start'), parseDayBoundary(to, 'end'), strategy);
        console.log(`Backfill ${result.id} queued with ${result.slices} slices. The worker process executes it.`);
        break;
      }
      case 'backfill-status': {
        const rows = await app.get(DatabaseService).query(
          `SELECT b.id, b.status, b.strategy, b.range_start, b.range_end, b.total_slices,
                  count(s.*) FILTER (WHERE s.status = 'done') AS done,
                  count(s.*) FILTER (WHERE s.status = 'skipped') AS skipped,
                  count(s.*) FILTER (WHERE s.status = 'failed') AS failed,
                  count(s.*) FILTER (WHERE s.status IN ('pending', 'running')) AS remaining,
                  coalesce(sum(s.matched), 0) AS matched
             FROM backfills b LEFT JOIN backfill_slices s ON s.backfill_id = b.id
            GROUP BY b.id ORDER BY b.id`,
        );
        console.table(rows);
        const [counts] = await app.get(DatabaseService).query(
          `SELECT count(*) FILTER (WHERE status = 'accepted') AS accepted, count(*) FILTER (WHERE status = 'pending_review') AS pending,
                  count(*) FILTER (WHERE status = 'rejected') AS rejected, count(*) FILTER (WHERE status = 'duplicate') AS duplicates
             FROM articles`,
        );
        console.table([counts]);
        break;
      }
      case 'backfill-resume': {
        const id = Number(arg(args, 'id'));
        if (!Number.isInteger(id)) throw new Error('backfill-resume needs --id');
        console.log(`Re-queued ${await app.get(IngestionService).dispatchBackfill(id, true)} slices`);
        break;
      }
      case 'ingest-now':
        console.log(`Queued ${await app.get(IngestionService).enqueueCycle('manual')} query jobs`);
        break;
      case 'reindex': {
        const r = await app.get(IndexingService).reindexAll();
        console.log(`Indexed ${r.documents} documents into ${r.index} (replaced: ${r.previous.join(', ') || 'none'})`);
        break;
      }
      case 'rescore':
        console.log(await app.get(MaintenanceService).rescoreAll());
        break;
      case 'retention':
        console.log(await app.get(MaintenanceService).retention());
        break;
      default:
        process.stdout.write(USAGE);
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
