// src/auth/dto/register.dto.ts
import {
        IsEmail,
        IsNotEmpty,
        MinLength,
        Matches,
        IsOptional,
        IsNumber,
        Min,
        Max,
        IsString,
} from 'class-validator';

export class RegisterDto {
        @IsNotEmpty({ message: 'Họ và tên không được để trống' })
        full_name: string;

        @IsNotEmpty({ message: 'Ngày sinh không được để trống' })
        @IsString()
        @Matches(/^\d{4}$|^\d{4}-\d{2}-\d{2}$/, {
                message: 'Ngày sinh phải có dạng YYYY hoặc YYYY-MM-DD',
        })
        date_of_birth: string;

        @IsOptional()
        phone_number?: string;

        @IsEmail({}, { message: 'Email không hợp lệ' })
        @IsNotEmpty({ message: 'Email không được để trống' })
        email: string;

        @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
        @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
        @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])/, {
                message: 'Mật khẩu cần chữ hoa, thường, số và ký tự đặc biệt',
        })
        password: string;

        @IsNotEmpty({ message: 'Vui lòng xác nhận mật khẩu' })
        confirmPassword: string;
}
