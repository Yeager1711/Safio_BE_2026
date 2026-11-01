import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserSession } from '../../../entities/user-session.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
        constructor(
                @InjectRepository(UserSession)
                private readonly sessionRepository: Repository<UserSession>
        ) {
                const secret = process.env.JWT_SECRET;

                if (!secret) {
                        throw new Error('JWT_SECRET chưa được cấu hình');
                }

                super({
                        jwtFromRequest: ExtractJwt.fromExtractors([
                                (req) => req?.cookies?.token,
                                ExtractJwt.fromAuthHeaderAsBearerToken(),
                        ]),
                        secretOrKey: secret,
                        ignoreExpiration: false,
                });
        }

        async validate(payload: any) {
                if (!payload.userId || !payload.sessionId) {
                        throw new UnauthorizedException('Token không hợp lệ');
                }

                const session = await this.sessionRepository.findOne({
                        where: {
                                id: payload.sessionId,
                                user_id: payload.userId,
                                is_active: true,
                                revoked_at: null,
                        },
                });

                if (!session) {
                        throw new UnauthorizedException(
                                'Phiên đăng nhập đã hết hạn hoặc bị thu hồi'
                        );
                }

                return {
                        userId: payload.userId,
                        email: payload.email,
                        role: payload.role,
                        sessionId: session.id,
                };
        }
}
