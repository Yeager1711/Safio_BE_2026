import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthUserService } from './login_user.service';
import { AuthUserController } from './login_user.controller';
import { JwtStrategy } from './jwt.strategy';

import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';
import { UserSession } from '../../../entities/user-session.entity';

@Module({
        imports: [
                TypeOrmModule.forFeature([User, Role, UserSession]),
                PassportModule,
                JwtModule.register({
                        secret:
                                process.env.JWT_SECRET ||
                                'Safio_2025_CareAI_1711_huynhnamyeager_A9sd82!ksQ',
                        signOptions: {
                                expiresIn: '12h',
                        },
                }),
        ],
        controllers: [AuthUserController],
        providers: [AuthUserService, JwtStrategy],
        exports: [AuthUserService, PassportModule],
})
export class AuthUserLoginModule {}
