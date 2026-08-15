import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum CameraType {
        IP = 'IP',
        EZVIZ = 'Ezviz',
        IMOU = 'Imou',
}

export class CreateCameraDto {
        @IsString()
        @IsNotEmpty()
        @MaxLength(100)
        cam_name: string;

        @IsString()
        @IsNotEmpty()
        @MaxLength(100)
        location: string;

        @IsOptional()
        @IsString()
        @MaxLength(100)
        ip_address?: string;

        @IsEnum(CameraType)
        camera_type: CameraType;

        // ============================
        // EZVIZ
        // ============================

        @IsOptional()
        @IsString()
        app_key?: string;

        @IsOptional()
        @IsString()
        app_secret?: string;

        @IsOptional()
        @IsString()
        ezviz_username?: string;

        @IsOptional()
        @IsString()
        ezviz_password?: string;

        @IsOptional()
        @IsString()
        device_serial?: string;

        @IsOptional()
        @IsString()
        verify_code?: string;

        // ============================
        // IMOU
        // ============================

        @IsOptional()
        @IsString()
        imou_app_id?: string;

        @IsOptional()
        @IsString()
        imou_app_secret?: string;

        @IsOptional()
        @IsString()
        imou_token?: string;

        @IsOptional()
        @IsString()
        imou_device_id?: string;

        // ============================
        // RTSP
        // ============================

        @IsOptional()
        @IsString()
        rtsp_username?: string;

        @IsOptional()
        @IsString()
        rtsp_password?: string;

        @IsOptional()
        rtsp_port?: number;

        @IsOptional()
        rtsp_channel?: number;
}
