import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AI_Controller } from './ai.controller';
import { AI_Service } from './ai.service';

import { User } from '../../../entities/users.entity';
import { Camera } from '../../../entities/camera.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { ActiveLog } from '../../../entities/active_logs.entity';
import { FamilyMember } from '../../../entities/family-member.entity';
import { WarningType } from '../../../entities/warning_type.entity';

import { AuthMiddleware } from '../../../middlewares/auth/auth.middleware';

import { FallDetectionContextService } from './context/fall-detection-context.service';

import { IntentRouterService } from './intent/intent-router.service';
import { KeywordIntentRouter } from './intent/keyword-intent.router';
import { DiagramIntentRouter } from './intent/diagram-intent.router';
import { FollowUpIntentRouter } from './intent/follow-up-intent.router';
import { ExternalKnowledgeRouter } from './intent/external-knowledge.router';
import { LlmIntentRouter } from './intent/llm-intent.router';

import { WebSearchService } from './search/web-search.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TypeOrmModule.forFeature([
            User,
            Camera,
            FaceProfile,
            ActiveLog,
            FamilyMember,
            WarningType,
        ]),
    ],
    controllers: [AI_Controller],
    providers: [
        AI_Service,
        IntentRouterService,
        KeywordIntentRouter,
        DiagramIntentRouter,
        FollowUpIntentRouter,
        ExternalKnowledgeRouter,
        LlmIntentRouter,
        WebSearchService,
        FallDetectionContextService,
    ],
    exports: [
        AI_Service,
        FallDetectionContextService,
    ],
})
export class AI_Module implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(AuthMiddleware).forRoutes(
            {
                path: 'ai/ask-safio',
                method: RequestMethod.POST,
            },
            {
                path: 'ai/ask-duration',
                method: RequestMethod.POST,
            },
            {
                path: 'ai/end-session',
                method: RequestMethod.POST,
            },
        );
    }
};
