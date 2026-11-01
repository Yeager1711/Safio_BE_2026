import {
        IsEmail,
        IsIn,
        IsNotEmpty,
        IsOptional,
        IsString,
        Length,
        MinLength,
        Matches,
} from 'class-validator';

export class RequestChangePasswordOtpDto {
        @IsIn(['email', 'password'], { message: 'method phải là email hoặc password' })
        method: 'email' | 'password';

        @IsOptional()
        @IsEmail({}, { message: 'Email không hợp lệ' })
        email?: string;

        @IsOptional()
        @IsString()
        @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
        currentPassword?: string;
}

export class ChangePasswordDto {
        @IsString()
        @Length(6, 6, { message: 'OTP phải gồm 6 chữ số' })
        @Matches(/^\d{6}$/, { message: 'OTP phải gồm 6 chữ số' })
        otp: string;

        @IsString()
        @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
        @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
                message: 'Mật khẩu cần gồm chữ hoa, chữ thường và số',
        })
        newPassword: string;

        @IsString()
        @IsNotEmpty({ message: 'Xác nhận mật khẩu không được để trống' })
        confirmPassword: string;
}
