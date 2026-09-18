import { Module } from '@nestjs/common';
import { DomainModule, InfrastructureModule } from '../app.module';
import { WorkerRunnerService } from './worker-runner.service';

/** Background process: BullMQ workers and schedules. Serves no HTTP traffic. */
@Module({
  imports: [InfrastructureModule, DomainModule],
  providers: [WorkerRunnerService],
})
export class WorkerModule {}
