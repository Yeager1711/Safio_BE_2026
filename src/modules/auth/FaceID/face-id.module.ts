import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtModule } from '@nestjs/jwt';

import { FaceIdController } from './face-id.controller';

import { FaceIdService } from './face-id.service';

import { FaceAIService } from './face-ai.service';

import { User } from '../../../entities/users.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { FaceEmbedding } from '../../../entities/face_embedding.entity';

@Module({
        imports: [
                TypeOrmModule.forFeature([User, FaceProfile, FaceEmbedding]),

                JwtModule.register({
                        secret: process.env.JWT_SECRET,

                        signOptions: {
                                expiresIn: '7d',
                        },
                }),
        ],

        controllers: [FaceIdController],

        providers: [FaceIdService, FaceAIService],

        exports: [FaceIdService],
})
export class FaceIdModule {}
