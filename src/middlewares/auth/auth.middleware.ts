import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

interface JwtPayload {
        user_id?: string;
        userId?: string;
        email?: string;
        role?: string;
        full_name?: string;
        iat?: number;
        exp?: number;
}

export interface AuthenticatedRequest extends Request {
        user?: {
                user_id: string;
                email?: string;
                role?: string;
                full_name?: string;
        };
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
        constructor(private readonly jwtService: JwtService) {}

        async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
                const authHeader = req.headers.authorization;

                if (!authHeader?.startsWith('Bearer ')) {
                        throw new UnauthorizedException('Unauthorized: No token provided');
                }

                const token = authHeader.substring(7);

                console.log('Access_Token:', token);

                try {
                        const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
                                secret: process.env.JWT_SECRET,
                        });

                        const userId = payload.user_id ?? payload.userId;

                        if (!userId) {
                                throw new UnauthorizedException(
                                        'Invalid token: user_id is missing'
                                );
                        }

                        // Chuẩn hóa dữ liệu để dùng toàn hệ thống
                        req.user = {
                                user_id: userId,
                                email: payload.email,
                                role: payload.role,
                                full_name: payload.full_name,
                        };
                        next();
                } catch (error: any) {
                        console.error('JWT Verify Error:', error);

                        if (error.name === 'TokenExpiredError') {
                                throw new UnauthorizedException('Unauthorized: Token has expired');
                        }

                        if (error.name === 'JsonWebTokenError') {
                                throw new UnauthorizedException(
                                        `Unauthorized: Invalid token (${error.message})`
                                );
                        }

                        throw new UnauthorizedException(error.message || 'Unauthorized');
                }
        }
}
