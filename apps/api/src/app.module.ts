import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from './core.module';

@Module({
  imports: [ScheduleModule.forRoot(), CoreModule],
})
export class AppModule {}
