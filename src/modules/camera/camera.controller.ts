import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { CameraService } from './camera.service';
import { CreateCameraDto } from './dto/create-camera.dto';

interface AuthenticatedRequest extends Request {
        user?: {
                user_id: string;
                email: string;
                role: string;
                full_name?: string;
        };
}

@Controller('cameras')
export class CameraController {
        constructor(private readonly cameraService: CameraService) {}

        @Post('create')
        async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCameraDto) {
                const user = req.user;

                if (!user?.user_id) {
                        throw new UnauthorizedException('Bạn chưa đăng nhập');
                }

                return this.cameraService.create(user.user_id, dto);
        }

        @Get('get-cameras')
        async getCameras(@Req() req: AuthenticatedRequest) {
                const user = req.user;

                if (!user?.user_id) {
                        throw new UnauthorizedException('Bạn chưa đăng nhập');
                }

                return this.cameraService.getCameras(user.user_id);
        }
}
