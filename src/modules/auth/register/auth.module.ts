import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Import Entities
import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';

@Module({
        imports: [
                TypeOrmModule.forFeature([User, Role]),

                JwtModule.register({
                        secret:
                                process.env.JWT_SECRET ||
                                'Safio_2025_CareAI_1711_huynhnamyeager_A9sd82!ksQ',
                        signOptions: { expiresIn: '1d' },
                }),
        ],
        controllers: [AuthController],
        providers: [AuthService],
})
export class AuthModule {}
