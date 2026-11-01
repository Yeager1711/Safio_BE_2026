import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeviceInfoDto {
        @IsString()
        @IsNotEmpty()
        @MaxLength(100)
        deviceId: string;

        @IsString()
        @IsNotEmpty()
        @MaxLength(150)
        deviceName: string;

        @IsIn(['desktop', 'mobile', 'tablet'])
        deviceType: 'desktop' | 'mobile' | 'tablet';

        @IsString()
        @IsNotEmpty()
        @MaxLength(50)
        browser: string;

        @IsString()
        @IsNotEmpty()
        @MaxLength(50)
        operatingSystem: string;
}
