import { Module } from '@nestjs/common';
import { FallWarningController } from './Fall_warning.controller';
import { FallWarningService } from './Fall_warning.service';

@Module({
        controllers: [FallWarningController],
        providers: [FallWarningService],
})
export class FallWarningModule {}
