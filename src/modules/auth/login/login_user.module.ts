import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuthUserService } from './login_user.service';
import { AuthUserController } from './login_user.controller';

// Import đúng tên entity (không có 's')
import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';

@Module({
        imports: [
                TypeOrmModule.forFeature([User, Role]),

                JwtModule.register({
                        secret:
                                process.env.JWT_SECRET ||
                                'Safio_2025_CareAI_1711_huynhnamyeager_A9sd82!ksQ',
                        signOptions: { expiresIn: '7d' },
                }),
        ],
        controllers: [AuthUserController],
        providers: [AuthUserService],
        exports: [AuthUserService],
})
export class AuthUserLoginModule {}
