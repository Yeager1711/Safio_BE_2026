import { Body, Controller, Delete, Get, Post, Req, UnauthorizedException } from '@nestjs/common';

import { FaceIdService } from './face-id.service';

import { RegisterFaceDto } from '../dto/register-face.dto';
import { VerifyFaceDto } from '../dto/verify-face.dto';

interface AuthenticatedRequest extends Request {
        user?: {
                user_id: string;
        };
}

@Controller('face-id')
export class FaceIdController {
        constructor(private readonly faceIdService: FaceIdService) {}

        @Post('register')
        async registerFace(@Req() req: AuthenticatedRequest, @Body() dto: RegisterFaceDto) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('Chưa đăng nhập');
                }

                return this.faceIdService.registerFace(req.user.user_id, dto);
        }

        @Post('verify')
        async verifyFace(@Req() req: AuthenticatedRequest, @Body() dto: VerifyFaceDto) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('Chưa đăng nhập');
                }

                return this.faceIdService.verifyFace(req.user.user_id, dto);
        }

        @Get('profile')
        async getFaceProfile(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('Chưa đăng nhập');
                }

                return this.faceIdService.getFaceProfile(req.user.user_id);
        }

        @Delete('profile')
        async deleteFace(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('Chưa đăng nhập');
                }

                return this.faceIdService.deleteFace(req.user.user_id);
        }
}
