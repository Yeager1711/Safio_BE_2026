import {
        BadRequestException,
        Controller,
        Post,
        Body,
        Req,
        UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AI_Service } from './ai.service';

interface AuthenticatedRequest extends Request {
        user?: {
                user_id: string;
                email: string;
                role: string;
                full_name?: string;
        };
}

@Controller('ai')
export class AI_Controller {
        constructor(private readonly aiService: AI_Service) {}

        @Post('ask-safio')
        async askMintoBot(@Body('question') question: string, @Req() req: AuthenticatedRequest) {
                if (!question?.trim()) {
                        throw new BadRequestException('Câu hỏi không được để trống');
                }

                if (!req.user) {
                        throw new UnauthorizedException('User chưa được xác thực');
                }

                const response = await this.aiService.answerAsSafioAI(req.user.user_id, question, {
                        full_name: req.user.full_name,
                        email: req.user.email,
                        role: req.user.role,
                });

                return {
                        response,
                };
        }

        @Post('end-session')
        async endSession(@Req() req: AuthenticatedRequest) {
                if (req.user?.user_id) {
                        await this.aiService.endChatSession(req.user.user_id);
                }

                return {
                        success: true,
                };
        }
}
