// import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { ConfigModule } from '@nestjs/config';
// import { JwtModule } from '@nestjs/jwt';
// import { MulterModule } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { extname, join } from 'path';
// import { readFileSync } from 'fs';
// import { ScheduleModule } from '@nestjs/schedule';
// import * as crypto from 'crypto';

// if (!(global as any).crypto) {
//         (global as any).crypto = crypto;
// }

// // Entities
// import { Users } from './entities/users.entity';
// import { Role } from './entities/role.entity';
// import { Category } from './entities/category.entity';
// import { Templates } from './entities/templates.entity';
// import { Thumbnails } from './entities/thumbnails.entity';
// import { Cards } from './entities/cards.entity';
// import { Invitations } from './entities/invitations.entity';
// import { Guests } from './entities/guests.entity';
// import { Payments } from './entities/payments.entity';
// import { QR_Users } from './entities/qr-users.entity';
// import { Error_Feedbacks } from './entities/error-feedbacks.entity';
// import { Feedback_Users } from './entities/feedback-users.entity';

// // Middleware
// import { AuthMiddleware } from './middlewares/auth/auth.middleware';
// import { ImageKitController } from './imagekit/imagekit.controller';

// // Modules
// import { UserModule } from './modules/auth/user/user.module';
// import { CategoryModule } from './modules/category/category.module';
// import { TemplateModule } from './modules/template/template.module';
// import { AuthModule } from './modules/auth/register/auth.module';
// import { AuthUserLoginModule } from './modules/auth/login/login_user.module';
// import { CardModule } from './modules/card/card.module';
// import { PayOSModule } from './modules/payment/payos.module';
// import { QRModule } from './modules/QR_code/qr.module';
// import { ErrorFeedbackModule } from './modules/feedback/error-feedback/error-feedback.module';
// import { UserFeedbackModule } from './modules/feedback/user-feedback/user-feedback.module';
// import { AI_Module } from './modules/auth/AI_reply/ai.module';

// const uploadDir = join(__dirname, '..', 'Uploads', 'templates');

// @Module({
//         imports: [
//                 ScheduleModule.forRoot(),
//                 ConfigModule.forRoot({
//                         isGlobal: true,
//                         envFilePath: '.env',
//                 }),
//                 TypeOrmModule.forRoot({
//                         type: 'mysql',
//                         host: process.env.DB_HOST || '',
//                         port: parseInt(process.env.DB_PORT, 10),
//                         username: process.env.DB_USER || '',
//                         password: process.env.DB_PASSWORD || '', // Thay bằng mật khẩu thực tế từ Aiven
//                         database: process.env.DB_NAME || 'minto',
//                         entities: [
//                                 Users,
//                                 Role,
//                                 Category,
//                                 Templates,
//                                 Thumbnails,
//                                 Cards,
//                                 Invitations,
//                                 Guests,
//                                 Payments,
//                                 QR_Users,
//                                 Error_Feedbacks,
//                                 Feedback_Users,
//                         ],
//                         synchronize: true,
//                         ssl: {
//                                 ca: readFileSync(join(__dirname, '..', 'ca.pem')), // Đường dẫn đến tệp CA certificate từ Aiven
//                                 rejectUnauthorized: false,
//                         },
//                         driver: require('mysql2'), // Sử dụng mysql2 để hỗ trợ tốt hơn
//                 }),
//                 JwtModule.register({
//                         global: true,
//                         secret: process.env.JWT_SECRET || 'MintoInvitiOnsJWTSECRET_KEYVALUES',
//                         signOptions: { expiresIn: '1d' },
//                 }),
//                 MulterModule.register({
//                         storage: diskStorage({
//                                 destination: uploadDir,
//                                 filename: (req, file, callback) => {
//                                         const uniqueSuffix =
//                                                 Date.now() + '-' + Math.round(Math.random() * 1e9);
//                                         const ext = extname(file.originalname);
//                                         callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
//                                 },
//                         }),
//                         fileFilter: (req, file, callback) => {
//                                 if (!file.mimetype.match(/image\/(jpg|jpeg|png|gif)$/)) {
//                                         return callback(
//                                                 new Error(
//                                                         'Chỉ chấp nhận file ảnh (jpg, jpeg, png, gif)'
//                                                 ),
//                                                 false
//                                         );
//                                 }
//                                 callback(null, true);
//                         },
//                         limits: {
//                                 fileSize: 5 * 1024 * 1024, // Giới hạn 5MB
//                         },
//                 }),
//                 AuthModule,
//                 AuthUserLoginModule,
//                 UserModule,
//                 CategoryModule,
//                 TemplateModule,
//                 CardModule,
//                 PayOSModule,
//                 QRModule,
//                 ErrorFeedbackModule,
//                 UserFeedbackModule,
//                 AI_Module,
//         ],
//         controllers: [ImageKitController], // Thêm ImageKitController vào đây
// })
// export class AppModule implements NestModule {
//         configure(consumer: MiddlewareConsumer) {
//                 consumer.apply(AuthMiddleware)
//                         .exclude(
//                                 { path: 'auth/register', method: RequestMethod.POST },
//                                 { path: 'auth/login', method: RequestMethod.POST },
//                                 { path: 'categories/getCategories', method: RequestMethod.GET },
//                                 {
//                                         path: 'templates/getTemplate/:template_id',
//                                         method: RequestMethod.GET,
//                                 },
//                                 {
//                                         path: 'cards/:template_id/:guest_id/:invitation_id/:card_id',
//                                         method: RequestMethod.GET,
//                                 },
//                                 {
//                                         path: 'templates/getTemplate',
//                                         method: RequestMethod.GET,
//                                 },

//                                 { path: 'qr/public/qrs/:userId', method: RequestMethod.GET },
//                                 {
//                                         path: 'user-feedback/all-user-feedback',
//                                         method: RequestMethod.GET,
//                                 }
//                         )
//                         .forRoutes(
//                                 { path: 'users/profile', method: RequestMethod.GET },
//                                 { path: 'categories/add-template', method: RequestMethod.POST },
//                                 { path: 'templates/add-template', method: RequestMethod.POST },
//                                 { path: 'cards/save-card', method: RequestMethod.POST },
//                                 { path: 'cards/user-templates', method: RequestMethod.GET },
//                                 { path: 'payos/create-payment', method: RequestMethod.POST },
//                                 { path: 'payos/status/:orderCode', method: RequestMethod.PATCH },
//                                 { path: 'payos/statistics', method: RequestMethod.GET },
//                                 { path: 'users/profile/name', method: RequestMethod.PATCH },
//                                 { path: 'qr/create', method: RequestMethod.POST },
//                                 { path: 'qr/my-qrs', method: RequestMethod.GET },
//                                 { path: 'qr/:qrId/status', method: RequestMethod.PATCH },
//                                 { path: 'error-feedback/submit', method: RequestMethod.POST },
//                                 {
//                                         path: 'error-feedback/all-error-feedback',
//                                         method: RequestMethod.GET,
//                                 },
//                                 {
//                                         path: 'error-feedback/:id',
//                                         method: RequestMethod.PATCH,
//                                 },
//                                 {
//                                         path: 'error-feedback/user-feedbacks',
//                                         method: RequestMethod.GET,
//                                 },
//                                 {
//                                         path: 'users/check-discount-eligibility',
//                                         method: RequestMethod.GET,
//                                 },
//                                 {
//                                         path: 'user-feedback/submit',
//                                         method: RequestMethod.POST,
//                                 },
//                                 {
//                                         path: 'templates/update-template/:template_id',
//                                         method: RequestMethod.PATCH,
//                                 },
//                                 {
//                                         path: 'ai/ask-minto',
//                                         method: RequestMethod.POST,
//                                 },
//                                 {
//                                         path: 'ai/end-session',
//                                         method: RequestMethod.POST,
//                                 }
//                         );
//         }
// }

// if (process.env.NODE_ENV !== 'production') {
//         console.log('DB Config:', {
//                 host: process.env.DB_HOST,
//                 port: process.env.DB_PORT,
//                 username: process.env.DB_USER,
//                 database: process.env.DB_NAME,
//         });
//         console.log('SSL Config Enabled:', true);
//         console.log('JWT_SECRET:', process.env.JWT_SECRET);
// }

import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { readFileSync } from 'fs';
import { join } from 'path';

// Middleware
import { AuthMiddleware } from './middlewares/auth/auth.middleware';

// Các module nghiệp vụ
import { AuthModule } from './modules/auth/register/auth.module';
import { AuthUserLoginModule } from './modules/auth/login/login_user.module';
import { UserModule } from './modules/auth/user/user.module';
import { RelativeModule } from './modules/auth/Relative/relative.module';
import { CameraModule } from './modules/camera/camera.module';
import { AI_Module } from './modules/auth/AI_reply/ai.module';
import { FaceIdModule } from './modules/auth/FaceID/face-id.module';
import { FallDetectionModule } from './modules/Fall-detection/fall-detection.module';

// Import Entities
import { User } from './entities/users.entity';
import { Role } from './entities/roles.entity';
import { Relative } from './entities/relatives.entity';
import { Camera } from './entities/camera.entity';
import { WarningType } from './entities/warning_type.entity';
import { ActiveLog } from './entities/active_logs.entity';
import { Notification } from './entities/notifications.entity';
import { FamilyMember } from './entities/family-member.entity';
import { FamilyGroup } from './entities/family-group.entity';
import { FaceProfile } from './entities/face_profile.entity';
import { FaceEmbedding } from './entities/face_embedding.entity';
import { FaceRecognitionLog } from './entities/face_recognition_log.entity';

@Module({
        imports: [
                ConfigModule.forRoot({
                        isGlobal: true,
                        envFilePath: '.env',
                }),

                JwtModule.register({
                        global: true,
                        secret:
                                process.env.JWT_SECRET ||
                                'Safio_2025_CareAI_1711_huynhnamyeager_A9sd82!ksQ',
                        signOptions: {
                                // Sửa lỗi TypeScript: process.env trả về string | undefined
                                expiresIn: (process.env.JWT_EXPIRES || '7d') as any,
                        },
                }),

                // ================== KẾT NỐI AIVEN MySQL ==================
                TypeOrmModule.forRoot({
                        type: 'mysql',
                        host: process.env.DB_HOST || '',
                        port: parseInt(process.env.DB_PORT || '3306', 10),
                        username: process.env.DB_USER || '',
                        password: process.env.DB_PASSWORD || '',
                        database: process.env.DB_NAME || 'Safio_Care_AI',

                        entities: [
                                User,
                                Role,
                                Relative,
                                Camera,
                                WarningType,
                                ActiveLog,
                                Notification,
                                FamilyMember,
                                FamilyGroup,
                                FaceProfile,
                                FaceEmbedding,
                                FaceRecognitionLog,
                        ],

                        synchronize: process.env.NODE_ENV === 'development', // Nên false trên production
                        logging: process.env.NODE_ENV === 'development',

                        // SSL cho Aiven
                        ssl: {
                                ca: readFileSync(join(__dirname, '..', 'ca.pem')),
                                rejectUnauthorized: false,
                        },

                        driver: require('mysql2'),
                }),

                // Các Module nghiệp vụ
                AuthModule,
                AuthUserLoginModule,
                UserModule,
                RelativeModule,
                CameraModule,
                AI_Module,
                FaceIdModule,
                FallDetectionModule,
        ],
})
export class AppModule {
        configure(consumer: MiddlewareConsumer) {
                consumer.apply(AuthMiddleware)
                        .exclude(
                                /**
                                 * Auth
                                 */
                                {
                                        path: 'auth/login',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'auth/register',
                                        method: RequestMethod.POST,
                                }
                        )
                        .forRoutes(
                                /**
                                 * User
                                 */
                                {
                                        path: 'users/profile',
                                        method: RequestMethod.GET,
                                },
                                {
                                        path: 'users/search_User',
                                        method: RequestMethod.GET,
                                },

                                {
                                        path: 'users/face-id/status',
                                        method: RequestMethod.GET,
                                },

                                {
                                        path: 'users/face-id/require',
                                        method: RequestMethod.PATCH,
                                },

                                /**
                                 * Relative
                                 */
                                {
                                        path: 'relative/invite',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'relative/respond/:id',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'relative/accept/:id',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'relative/deny/:id',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'relative/update-relationship/:id',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'relative/family-requests',
                                        method: RequestMethod.GET,
                                },
                                {
                                        path: 'relative/pending',
                                        method: RequestMethod.GET,
                                },
                                {
                                        path: 'relative/family-members',
                                        method: RequestMethod.GET,
                                },

                                /**
                                 * Camera
                                 */
                                {
                                        path: 'cameras/create',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'cameras/get-cameras',
                                        method: RequestMethod.GET,
                                },

                                /**
                                 * AI Safio
                                 */
                                {
                                        path: 'ai/ask-safio',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'ai/end-session',
                                        method: RequestMethod.POST,
                                },

                                /**
                                 * Face ID (cần JWT)
                                 */
                                {
                                        path: 'face-id/register',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'face-id/profile',
                                        method: RequestMethod.GET,
                                },
                                {
                                        path: 'face-id/profile',
                                        method: RequestMethod.DELETE,
                                },

                                {
                                        path: 'face-id/verify',
                                        method: RequestMethod.POST,
                                },

                                // Fall Detection

                                {
                                        path: 'fall-detection/create',
                                        method: RequestMethod.POST,
                                },
                                {
                                        path: 'fall-detection/timeline',
                                        method: RequestMethod.GET,
                                },
                                {
                                        path: 'fall-detection/:id/warning',
                                        method: RequestMethod.PATCH,
                                }
                        );
        }
}
