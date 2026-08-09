import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
        const app = await NestFactory.create<NestExpressApplication>(AppModule);
        const configService = app.get(ConfigService);

        // ✅ Port
        const port = configService.get<number>('PORT') || 8888;

        // ✅ CORS cho frontend
        const allowedOrigins = configService
                .get<string>('CORS_ORIGINS')
                ?.split(',')
                .map((o) => o.trim().replace(/\/$/, '')) || ['http://localhost:8000'];

        app.enableCors({
                origin: (origin, callback) => {
                        const normalized = origin?.replace(/\/$/, '');
                        if (!normalized || allowedOrigins.includes(normalized))
                                callback(null, true);
                        else callback(new Error('Không được phép bởi CORS'));
                },
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                allowedHeaders: 'Content-Type, Authorization, ngrok-skip-browser-warning',
        });

        // ✅ Helmet bảo vệ các header HTTP
        app.use(
                helmet({
                        crossOriginEmbedderPolicy: false, // Tắt cái này nếu có dùng <img> hoặc <video> cross-origin
                        contentSecurityPolicy: {
                                directives: {
                                        defaultSrc: ["'self'"],
                                        imgSrc: ["'self'", 'data:', 'https:'],
                                        scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
                                        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
                                },
                        },
                })
        );

        // ✅ Giới hạn body và bật validation
        app.use(bodyParser.json({ limit: '10mb' }));
        app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

        // ✅ Prefix cho toàn API
        app.setGlobalPrefix('api/v1');

        await app.listen(port);
        console.log(`🚀 Safio_Care_AI is running on http://localhost:${port}/api`);
}

bootstrap();
