import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';
import { RegisterDto } from '../dto/register.dto';

@Injectable()
export class AuthService {
        constructor(
                @InjectRepository(User)
                private userRepository: Repository<User>,

                @InjectRepository(Role)
                private roleRepository: Repository<Role>,

                private jwtService: JwtService
        ) {}

        private normalizeDob(dobStr: string): Date {
                // Accept: "YYYY" or "YYYY-MM-DD"
                if (/^\d{4}$/.test(dobStr)) {
                        return new Date(`${dobStr}-01-01`);
                }
                if (/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
                        const d = new Date(dobStr);
                        if (isNaN(d.getTime())) {
                                throw new BadRequestException('date_of_birth không hợp lệ');
                        }
                        return d;
                }
                throw new BadRequestException('date_of_birth phải là "YYYY" hoặc "YYYY-MM-DD"');
        }

        async register(registerDto: RegisterDto): Promise<{ user: User; token: string }> {
                const { full_name, email, password, confirmPassword, date_of_birth, phone_number } =
                        registerDto;

                if (password !== confirmPassword) {
                        throw new BadRequestException('Mật khẩu xác nhận không khớp');
                }

                const existingUser = await this.userRepository.findOne({ where: { email } });
                if (existingUser) {
                        throw new ConflictException('Email đã được sử dụng');
                }

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                // Xác định role (admin cho user đầu tiên)
                const userCount = await this.userRepository.count();
                const roleName = userCount === 0 ? 'admin' : 'customer';

                let role = await this.roleRepository.findOne({ where: { name: roleName } });

                if (!role) {
                        role = this.roleRepository.create({ name: roleName });
                        role = await this.roleRepository.save(role);
                }

                const dob = this.normalizeDob(date_of_birth);

                const newUser = this.userRepository.create({
                        full_name,
                        email,
                        password: hashedPassword,
                        phone_number,
                        date_of_birth: dob,
                        role: role, // Gán trực tiếp entity Role
                });

                const savedUser = await this.userRepository.save(newUser);

                const token = this.jwtService.sign({
                        user_id: savedUser.id,
                        email: savedUser.email,
                        role: roleName,
                        full_name: savedUser.full_name,
                });

                return { user: savedUser, token };
        }
}
