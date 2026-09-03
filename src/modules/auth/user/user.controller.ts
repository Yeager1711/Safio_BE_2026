// src/users/user.controller.ts
import {
        Controller,
        Get,
        Req,
        UnauthorizedException,
        NotFoundException,
        Query,
        BadRequestException,
        Patch,
        Body,
} from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';

interface AuthenticatedRequest extends Request {
        user?: { user_id?: string; email?: string; role?: string };
}

@Controller('users')
export class UserController {
        constructor(private readonly userService: UserService) {}

        @Get('all-users')
        async getAllUsers(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User not authenticated');
                }
                return this.userService.getAllUsers();
        }

        @Get('profile')
        async getUserProfile(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User not authenticated');
                }

                const userId = req.user.user_id as string;
                return this.userService.getUserProfile(userId);
        }

        @Get('search_User')
        async searchUsers(
                @Req() req: AuthenticatedRequest,
                @Query('q') query: string,
                @Query('page') page: string = '1',
                @Query('limit') limit: string = '10'
        ) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User not authenticated');
                }

                const pageNum = parseInt(page, 10);
                const limitNum = parseInt(limit, 10);

                if (isNaN(pageNum) || pageNum < 1) {
                        throw new BadRequestException('Invalid page number');
                }
                if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                        throw new BadRequestException('Limit must be between 1 and 100');
                }

                if (!query || query.trim() === '') {
                        throw new BadRequestException('Query parameter "q" is required');
                }

                return this.userService.searchUsers(query.trim(), pageNum, limitNum);
        }

        //Kiểm tra user đã xác thực khuôn mặt chưa
        @Get('face-id/status')
        async getFaceIdStatus(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User not authenticated');
                }

                return this.userService.getFaceIdStatus(req.user.user_id);
        }

        // Bật/tắt yêu cầu xác thực Face ID cho các hành động nhạy cảm
        @Patch('face-id/require')
        async updateRequireFaceId(
                @Req() req: AuthenticatedRequest,
                @Body('require_face_id') requireFaceId: boolean
        ) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User not authenticated');
                }

                if (typeof requireFaceId !== 'boolean') {
                        throw new BadRequestException('require_face_id must be a boolean');
                }

                return this.userService.updateRequireFaceId(req.user.user_id, requireFaceId);
        }

        // Lấy tiến trình thiết lập tài khoản (dùng cho màn Setup Progress)
        @Get('setup-progress')
        async getSetupProgress(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User not authenticated');
                }

                return this.userService.getSetupProgress(req.user.user_id);
        }
}
