import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetFallTimelineDto {
        @IsOptional()
        @Type(() => Number)
        @IsInt()
        @Min(1)
        page?: number = 1;

        @IsOptional()
        @Type(() => Number)
        @IsInt()
        @Min(1)
        @Max(200)
        limit?: number = 50;

        @IsOptional()
        @IsUUID()
        warningTypeId?: string;
}
