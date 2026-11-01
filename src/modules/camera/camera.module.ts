import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { CameraController } from './camera.controller';

import { CameraService } from './camera.service';

import { EncryptionService } from './encryption.service';

import { Camera } from '../../entities/camera.entity';

import { User } from '../../entities/users.entity';

import { FamilyMember } from '../../entities/family-member.entity';

@Module({
        imports: [TypeOrmModule.forFeature([Camera, User, FamilyMember])],

        controllers: [CameraController],

        providers: [CameraService, EncryptionService],

        exports: [CameraService, EncryptionService],
})
export class CameraModule {}
