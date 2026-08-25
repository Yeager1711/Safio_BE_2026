import { IsIn, IsInt, IsString, Min } from 'class-validator';

export class VerifyFrameDto {
        @IsString()
        image: string;

        @IsIn(['center', 'left', 'right'])
        angle: string;

        @IsInt()
        @Min(1)
        frameIndex: number;
}
