import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { TypeOrmModule } from '@nestjs/typeorm';

import { AI_Controller } from './ai.controller';

import { AI_Service } from './ai.service';

import { User } from '../../../entities/Users.entity';

import { AuthMiddleware } from '../../../middlewares/auth/auth.middleware';

@Module({
        imports: [
                ConfigModule.forRoot({
                        isGlobal: true,
                }),

                TypeOrmModule.forFeature([User]),
        ],

        controllers: [AI_Controller],

        providers: [AI_Service],
})
export class AI_Module implements NestModule {
        configure(consumer: MiddlewareConsumer) {
                consumer.apply(AuthMiddleware).forRoutes({
                        path: 'ai/ask-duration',
                        method: RequestMethod.POST,
                });
        }
}
