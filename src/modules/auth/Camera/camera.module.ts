import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Camera } from '../../../entities/Camera.entity';
import { User } from '../../../entities/users.entity';
import { FamilyMember } from '../../../entities/family-member.entity';

import { CameraController } from './camera.controller';
import { CameraService } from './camera.service';

@Module({
        imports: [TypeOrmModule.forFeature([Camera, User, FamilyMember])],
        controllers: [CameraController],
        providers: [CameraService],
        exports: [CameraService],
})
export class CameraModule {}
