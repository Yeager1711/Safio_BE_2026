// src/camera/camera.controller.ts
import {
        Controller,
        Post,
        Req,
        Body,
        UnauthorizedException,
        BadRequestException,
        HttpCode,
        HttpStatus,
        Get,
} from '@nestjs/common';
import { CameraService } from './camera.service';

interface AuthenticatedRequest extends Request {
        user?: { user_id: string };
}

@Controller('camera')
export class CameraController {
        constructor(private readonly cameraService: CameraService) {}

        @Post('create')
        @HttpCode(HttpStatus.CREATED)
        async create(@Req() req: AuthenticatedRequest, @Body() body: any): Promise<any> {
                // Kiểm tra đăng nhập (giống như relative module)
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('Chưa đăng nhập');
                }

                // Validate các trường bắt buộc ngay tại controller (không dùng DTO)
                if (!body.cam_name?.trim()) {
                        throw new BadRequestException('Tên camera là bắt buộc');
                }
                if (!body.location?.trim()) {
                        throw new BadRequestException('Vị trí là bắt buộc');
                }

                // Log để debug giống relative
                console.log('[Camera Create] user_id =', req.user.user_id);
                console.log('[Camera Create] body =', JSON.stringify(body));

                // Map dữ liệu từ body frontend sang object mà service mong đợi
                const cameraData = {
                        cam_name: body.cam_name.trim(),
                        location: body.location.trim(),
                        camera_type: body.camera_type || 'Ezviz',

                        // Ezviz fields
                        ezviz_app_key: body.ezviz_app_key?.trim(),
                        ezviz_app_secret: body.ezviz_app_secret?.trim(),
                        ezviz_username: body.ezviz_username?.trim(),
                        ezviz_password: body.ezviz_password?.trim(),
                        ezviz_device_serial: body.ezviz_device_serial?.trim(),
                        ezviz_verify_code: body.ezviz_verify_code?.trim(),

                        // Imou fields
                        imou_app_id: body.imou_app_id?.trim(),
                        imou_app_secret: body.imou_app_secret?.trim(),
                        imou_device_id: body.imou_device_id?.trim(),
                        imou_rtsp_url: body.imou_rtsp_url?.trim(), // service sẽ lưu vào ip_address hoặc bỏ qua

                        // Các field khác nếu frontend gửi thêm (ip_address, status, v.v.)
                        ip_address: body.ip_address?.trim(),
                        status: body.status,
                };

                // Gọi service với user_id và dữ liệu đã map
                return await this.cameraService.create(req.user.user_id, cameraData);
        }

        //Quyền truy cập cam hướng đối tượng cá nhân hoặc tổ chức
        @Get('accessible-cameras')
        @HttpCode(HttpStatus.OK)
        async getAccessibleCameras(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) {
                        throw new UnauthorizedException('Chưa đăng nhập');
                }

                return this.cameraService.getCamerasForUser(req.user.user_id);
        }
}
