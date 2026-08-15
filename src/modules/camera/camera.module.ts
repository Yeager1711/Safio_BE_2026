import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CameraController } from './camera.controller';
import { CameraService } from './camera.service';

import { Camera } from '../../entities/camera.entity';
import { User } from '../../entities/users.entity';
import { FamilyMember } from '../../entities/family-member.entity';
import { FamilyGroup } from '../../entities/family-group.entity';

@Module({
        imports: [TypeOrmModule.forFeature([Camera, User, FamilyMember, FamilyGroup])],

        controllers: [CameraController],

        providers: [CameraService],

        exports: [CameraService],
})
export class CameraModule {}
