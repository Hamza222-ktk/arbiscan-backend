import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalsService } from './signals.service';
import { SignalsController } from './signals.controller';
import { Signal } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Signal])],
  providers: [SignalsService],
  controllers: [SignalsController],
  exports: [SignalsService],
})
export class SignalsModule {}
