import { Body, Controller, Get, Post, Query, Req, UnauthorizedException } from '@nestjs/common';

import { Request } from 'express';

import { FallDetectionService } from './fall-detection.service';
import { CreateFallDetectionDto } from './dto/create-fall-detection.dto';
import { GetFallTimelineDto } from './dto/get-fall-timeline.dto';

interface AuthenticatedRequest extends Request {
        user?: {
                user_id: string;
                email: string;
                role: string;
                full_name?: string;
        };
}

@Controller('fall-detection')
export class FallDetectionController {
        constructor(private readonly fallDetectionService: FallDetectionService) {}

        @Post('create')
        async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateFallDetectionDto) {
                const user = req.user;

                if (!user?.user_id) {
                        throw new UnauthorizedException('Bạn chưa đăng nhập');
                }

                return this.fallDetectionService.create(user.user_id, dto);
        }
        @Get('timeline')
        async getTimeline(@Req() req: AuthenticatedRequest, @Query() query: GetFallTimelineDto) {
                const user = req.user;

                if (!user?.user_id) {
                        throw new UnauthorizedException('Bạn chưa đăng nhập');
                }

                return this.fallDetectionService.getTimeline(user.user_id, query);
        }
}
