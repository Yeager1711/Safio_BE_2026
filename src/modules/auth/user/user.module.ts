import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
import { UserSession } from '../../../entities/user-session.entity';

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
                        UserSession,
                ]),
                ConfigModule,
                JwtModule.registerAsync({
                        imports: [ConfigModule],
                        useFactory: (config: ConfigService) => ({
                                secret:
                                        config.get<string>('JWT_SECRET') ||
                                        process.env.JWT_SECRET ||
                                        'your-secret-key',
                                signOptions: { expiresIn: '15m' },
                        }),
                        inject: [ConfigService],
                }),
        ],
        controllers: [UserController],
        providers: [UserService],
        exports: [UserService],
})
export class UserModule {}
