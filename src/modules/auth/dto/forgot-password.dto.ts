// src/users/dto/forgot-password.dto.ts
import { IsEmail, IsNotEmpty, IsString, Length, MinLength, Matches } from 'class-validator';

export class ForgotPasswordDto {
        @IsEmail({}, { message: 'Email không hợp lệ' })
        @IsNotEmpty({ message: 'Email là bắt buộc' })
        email: string;
}

export class VerifyResetOtpDto {
        @IsEmail({}, { message: 'Email không hợp lệ' })
        @IsNotEmpty()
        email: string;

        @IsString()
        @Length(6, 6, { message: 'OTP phải gồm 6 chữ số' })
        @Matches(/^\d{6}$/, { message: 'OTP phải gồm 6 chữ số' })
        otp: string;
}

export class ResetPasswordDto {
        @IsString()
        @IsNotEmpty({ message: 'resetToken là bắt buộc' })
        resetToken: string;

        @IsString()
        @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
        @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
                message: 'Mật khẩu cần có ít nhất một chữ cái và một chữ số',
        })
        newPassword: string;

        @IsString()
        @IsNotEmpty()
        confirmPassword: string;
}
