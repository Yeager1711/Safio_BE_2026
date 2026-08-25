// verify-face.dto.ts
import { IsArray, ArrayMinSize, IsString } from 'class-validator';

export class VerifyFaceDto {
        @IsArray()
        @ArrayMinSize(1)
        @IsString({ each: true })
        images: string[]; // mảng base64 (data:image/jpeg;base64,...)
}
