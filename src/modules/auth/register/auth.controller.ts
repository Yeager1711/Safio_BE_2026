import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from '../FaceID/DTO/register.dto';

@Controller('auth')
export class AuthController {
        constructor(private readonly authService: AuthService) {}

        @Post('register')
        @HttpCode(HttpStatus.CREATED)
        async register(@Body() registerDto: RegisterDto) {
                const { user, token } = await this.authService.register(registerDto);

                // Loại bỏ password trước khi trả về (TypeORM không có toObject())
                const { password, ...userWithoutPassword } = user;

                return {
                        message: 'Đăng ký tài khoản thành công',
                        user: userWithoutPassword,
                        token,
                };
        }
}
