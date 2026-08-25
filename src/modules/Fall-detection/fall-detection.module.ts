import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActiveLog } from '../../entities/active_logs.entity';
import { Camera } from '../../entities/camera.entity';
import { User } from '../../entities/users.entity';
import { WarningType } from '../../entities/warning_type.entity';
import { FamilyMember } from '../../entities/family-member.entity';
import { Notification } from '../../entities/notifications.entity';
import { FallDetectionController } from './fall-detection.controller';
import { FallDetectionService } from './fall-detection.service';

@Module({
        imports: [
                TypeOrmModule.forFeature([
                        ActiveLog,
                        Camera,
                        User,
                        WarningType,
                        FamilyMember,
                        Notification,
                ]),
        ],
        controllers: [FallDetectionController],
        providers: [FallDetectionService],
        exports: [FallDetectionService],
})
export class FallDetectionModule {}
