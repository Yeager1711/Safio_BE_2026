import {
        Controller,
        Post,
        Get,
        Param,
        Body,
        Req,
        UnauthorizedException,
        BadRequestException,
} from '@nestjs/common';
import { RelativeService } from './relative.service';

interface AuthenticatedRequest extends Request {
        user?: { user_id: string };
}

@Controller('relative')
export class RelativeController {
        constructor(private readonly relativeService: RelativeService) {}

        // ----------------------------------------------------
        // GET /relative/family-requests
        @Get('family-requests')
        async getMyFamilyRequests(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) throw new UnauthorizedException();
                return this.relativeService.getMyFamilyRequests(req.user.user_id);
        }

        @Post('invite')
        async postInvite(
                @Req() req: AuthenticatedRequest,
                @Body() body: { relative_user_id: string; relationship?: string }
        ): Promise<any> {
                // Bảo đảm đã đăng nhập
                if (!req.user?.user_id) throw new UnauthorizedException('Chưa đăng nhập');
                if (!body?.relative_user_id)
                        throw new BadRequestException('Thiếu relative_user_id');

                // LOG để debug request thực tế
                console.log('[Invite] req.user.user_id =', req.user.user_id);
                console.log('[Invite] body =', JSON.stringify(body));

                return this.relativeService.sendInvite(req.user.user_id, body);
        }

        @Post('respond/:id')
        async postRespond(
                @Req() req: AuthenticatedRequest,
                @Param('id') id: string,
                @Body('action') action: 'accept' | 'deny',
                @Body('relationship') relationship?: string
        ): Promise<any> {
                // <-- QUAN TRỌNG NHẤT
                if (!req.user?.user_id) throw new UnauthorizedException();

                if (!['accept', 'deny'].includes(action)) {
                        throw new BadRequestException('action phải là "accept" hoặc "deny"');
                }

                if (action === 'accept') {
                        return this.relativeService.acceptInvite(
                                id,
                                req.user.user_id,
                                relationship
                        );
                }

                return this.relativeService.denyInvite(id, req.user.user_id);
        }

        // ----------------------------------------------------
        // GET /relative/pending
        // ----------------------------------------------------
        @Get('pending')
        async getPending(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) throw new UnauthorizedException();
                return this.relativeService.getPendingInvites(req.user.user_id);
        }

        // ----------------------------------------------------
        // GET /relative/family-members
        // ----------------------------------------------------
        @Get('family-members')
        async getFamilyMembers(@Req() req: AuthenticatedRequest) {
                if (!req.user?.user_id) throw new UnauthorizedException();
                return this.relativeService.getFamilyMembers(req.user.user_id);
        }
}
