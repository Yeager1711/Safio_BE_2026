import {
        Controller,
        Post,
        Body,
        HttpCode,
        HttpStatus,
        UsePipes,
        ValidationPipe,
} from '@nestjs/common';

import { AuthUserService } from './login_user.service';
import { LoginDto } from '../dto/login.dto';

@Controller('auth')
export class AuthUserController {
        constructor(private readonly authUserService: AuthUserService) {}

        @Post('login')
        @HttpCode(HttpStatus.OK)
        @UsePipes(new ValidationPipe({ transform: true }))
        async login(@Body() loginDto: LoginDto) {
                return this.authUserService.login(loginDto.email, loginDto.password);
        }

        // Chưa triển khai Google Login
        @Post('google')
        @HttpCode(HttpStatus.OK)
        async loginWithGoogle() {
                return {
                        message: 'Google Login chưa được triển khai.',
                };
        }
}
