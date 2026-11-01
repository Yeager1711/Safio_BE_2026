import {
        IsEmail,
        IsNotEmpty,
        IsObject,
        IsOptional,
        IsString,
        ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceInfoDto } from './device-info.dto';

export class LoginDto {
        @IsEmail()
        email: string;

        @IsString()
        @IsNotEmpty()
        password: string;

        @IsOptional()
        @IsObject()
        @ValidateNested()
        @Type(() => DeviceInfoDto)
        deviceInfo?: DeviceInfoDto;
}
