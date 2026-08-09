import { Controller, Post, Body } from '@nestjs/common';
import { FallWarningService } from './Fall_warning.service';

interface FallAlertDto {
        camId: number;
        camName: string;
        timestamp: string;
        snapshot: string;
        fallType: string;
        behavior: string;
}

interface RecoveryDto {
        camId: number;
        camName: string;
        timestamp: string;
        recovered: boolean;
}

@Controller('fall-warning')
export class FallWarningController {
        constructor(private readonly fallWarningService: FallWarningService) {}

        // MỨC 1: Cảnh báo ban đầu
        @Post('alert1')
        async handleAlertLevel1(@Body() body: FallAlertDto) {
                await this.fallWarningService.sendAlertLevel1(body);
                return { message: 'Đã gửi cảnh báo MỨC 1' };
        }

        // MỨC 2: Sau 60s
        @Post('alert2')
        async handleAlertLevel2(@Body() body: FallAlertDto) {
                await this.fallWarningService.sendAlertLevel2(body);
                return { message: 'Đã gửi cảnh báo MỨC 2' };
        }

        // MỨC 3: Sau 120s
        @Post('alert3')
        async handleAlertLevel3(@Body() body: FallAlertDto) {
                await this.fallWarningService.sendAlertLevel3(body);
                return { message: 'Đã gửi cảnh báo MỨC 3' };
        }

        // PHỤC HỒI
        @Post('recovery')
        async handleRecovery(@Body() body: RecoveryDto) {
                await this.fallWarningService.sendRecoveryEmail(body);
                return { message: 'Đã gửi thông báo phục hồi' };
        }
}
