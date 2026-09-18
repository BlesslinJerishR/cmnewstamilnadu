import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { RedisService } from '../redis/redis.module';
import { DEFAULT_JOB_OPTIONS, QUEUES, QueueName } from './queue.constants';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {
    for (const name of Object.values(QUEUES)) {
      this.queues.set(
        name,
        new Queue(name, { connection: this.redis.bullmq, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
      );
    }
  }

  get(name: QueueName): Queue {
    const q = this.queues.get(name);
    if (!q) throw new Error(`Unknown queue ${name}`);
    return q;
  }

  all(): Queue[] {
    return [...this.queues.values()];
  }

  add(queue: QueueName, jobName: string, data: unknown, opts?: JobsOptions) {
    return this.get(queue).add(jobName, data, opts);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.all().map((q) => q.close()));
  }
}

@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
