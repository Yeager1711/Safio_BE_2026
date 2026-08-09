import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
        constructor(private readonly configService: ConfigService) {}

        use(req: Request, res: Response, next: NextFunction) {
                const apiKeyParam = req.params.keyAPI;
                const validKey = this.configService.get<string>('API_KEY');

                if (!apiKeyParam || apiKeyParam !== validKey) {
                        throw new UnauthorizedException('Invalid API Key');
                }

                next();
        }
}
