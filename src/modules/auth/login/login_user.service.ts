import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

import { User } from '../../../entities/users.entity';
import { UserSession } from '../../../entities/user-session.entity';
import { DeviceInfoDto } from '../dto/device-info.dto';

@Injectable()
export class AuthUserService {
        private readonly logger = new Logger(AuthUserService.name);

        constructor(
                @InjectRepository(User)
                private readonly userRepository: Repository<User>,

                @InjectRepository(UserSession)
                private readonly sessionRepository: Repository<UserSession>,

                private readonly jwtService: JwtService
        ) {}

        async login(
                email: string,
                password: string,
                deviceInfo?: DeviceInfoDto,
                ipAddress?: string
        ) {
                const user = await this.userRepository.findOne({
                        where: { email },
                        relations: ['role'],
                });

                if (!user) {
                        throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);

                if (!isPasswordValid) {
                        throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
                }

                const deviceId = deviceInfo?.deviceId || randomUUID();

                const session = this.sessionRepository.create({
                        user_id: String(user.id),
                        device_id: deviceId,
                        device_name: deviceInfo?.deviceName || 'Unknown device',
                        device_type: deviceInfo?.deviceType || 'desktop',
                        browser: deviceInfo?.browser || 'Unknown',
                        operating_system: deviceInfo?.operatingSystem || 'Unknown',
                        ip_address: ipAddress || null,
                        is_active: true,
                        revoked_at: null,
                });

                const savedSession = await this.sessionRepository.save(session);

                const payload = {
                        userId: user.id,
                        email: user.email,
                        role: user.role?.name,
                        sessionId: savedSession.id,
                };

                const accessToken = this.jwtService.sign(payload);

                this.logger.log('========== LOGIN SUCCESS ==========');
                this.logger.log(`User ID: ${user.id}`);
                this.logger.log(`Full name: ${user.full_name}`);
                this.logger.log(`Email: ${user.email}`);
                this.logger.log(`Role: ${user.role?.name}`);
                this.logger.log(`Session ID: ${savedSession.id}`);
                this.logger.log(`Device ID: ${savedSession.device_id}`);
                this.logger.log(`Device name: ${savedSession.device_name}`);
                this.logger.log(`Device type: ${savedSession.device_type}`);
                this.logger.log(`Browser: ${savedSession.browser}`);
                this.logger.log(`Operating system: ${savedSession.operating_system}`);
                this.logger.log(`IP address: ${savedSession.ip_address}`);
                this.logger.log(`Login time: ${savedSession.created_at}`);
                this.logger.log(`Session active: ${savedSession.is_active}`);
                this.logger.log('==================================');

                return {
                        message: 'Đăng nhập thành công',
                        accessToken,
                        session: {
                                id: savedSession.id,
                                deviceId: savedSession.device_id,
                                deviceName: savedSession.device_name,
                                deviceType: savedSession.device_type,
                                browser: savedSession.browser,
                                operatingSystem: savedSession.operating_system,
                                createdAt: savedSession.created_at,
                        },
                        user: {
                                id: user.id,
                                full_name: user.full_name,
                                email: user.email,
                                phone_number: user.phone_number,
                                role: user.role?.name,
                        },
                };
        }
}
