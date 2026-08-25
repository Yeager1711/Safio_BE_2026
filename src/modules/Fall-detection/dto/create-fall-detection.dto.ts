import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateFallDetectionDto {
        @IsUUID()
        @IsNotEmpty()
        cameraId: string;

        @IsOptional()
        @IsInt()
        personId?: number;

        @IsOptional()
        @IsString()
        action?: string;

        @IsOptional()
        @IsString()
        fallType?: string;

        @IsOptional()
        @IsString()
        behavior?: string;

        @IsOptional()
        @IsString()
        snapshotUrl?: string;

        @IsOptional()
        @IsString()
        contentLogs?: string;

        @IsOptional()
        @IsUUID()
        warningTypeId?: string;
}
