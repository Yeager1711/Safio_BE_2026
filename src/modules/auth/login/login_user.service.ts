import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';

@Injectable()
export class AuthUserService {
        constructor(
                @InjectRepository(User)
                private userRepository: Repository<User>,

                @InjectRepository(Role)
                private roleRepository: Repository<Role>,

                private jwtService: JwtService
        ) {}

        async login(email: string, password: string) {
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

                const payload = {
                        user_id: user.id,
                        full_name: user.full_name,
                        email: user.email,
                        role: user.role?.name,
                };

                const accessToken = this.jwtService.sign(payload);

                return {
                        message: 'Đăng nhập thành công',

                        accessToken,

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
