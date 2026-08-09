import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserService } from './user.service';
import { UserController } from './user.controller';

import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';
import { Relative } from '../../../entities/relatives.entity';
import { Camera } from '../../../entities/camera.entity';
import { ActiveLog } from '../../../entities/active_logs.entity';
import { Notification } from '../../../entities/notifications.entity';
import { WarningType } from '../../../entities/warning_type.entity';
import { FamilyMember } from '../../../entities/family-member.entity';
import { FamilyGroup } from '../../../entities/family-group.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { FaceEmbedding } from '../../../entities/face_embedding.entity';

@Module({
        imports: [
                TypeOrmModule.forFeature([
                        User,
                        Role,
                        Relative,
                        Camera,
                        ActiveLog,
                        Notification,
                        WarningType,
                        FamilyMember,
                        FamilyGroup,
                        FaceProfile,
                        FaceEmbedding,
                ]),
        ],
        controllers: [UserController],
        providers: [UserService],
        exports: [UserService],
})
export class UserModule {}
