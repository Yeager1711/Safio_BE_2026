// dto/update-fall-warning.dto.ts
import { IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateFallWarningDto {
        @IsNotEmpty()
        @IsUUID()
        warningTypeId: string;
}
