import { IsArray, IsNotEmpty, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class RegisterFaceDto {
        @IsArray()
        @ArrayMinSize(4)
        @ArrayMaxSize(4)
        images: FaceImageDto[];
}

export class FaceImageDto {
        @IsString()
        @IsNotEmpty()
        angle: 'front' | 'left' | 'right' | 'up';

        @IsString()
        @IsNotEmpty()
        image: string;
}
