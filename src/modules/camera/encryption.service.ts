import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService {
        private readonly algorithm = 'aes-256-gcm';
        private readonly key: Buffer;

        constructor() {
                const encryptionKey = process.env.CAMERA_ENCRYPTION_KEY;

                if (!encryptionKey) {
                        throw new Error(
                                'CAMERA_ENCRYPTION_KEY chưa được cấu hình trong environment'
                        );
                }

                try {
                        this.key = Buffer.from(encryptionKey, 'base64');
                } catch {
                        throw new Error('CAMERA_ENCRYPTION_KEY không phải Base64 hợp lệ');
                }

                if (this.key.length !== 32) {
                        throw new Error('CAMERA_ENCRYPTION_KEY phải có đúng 32 bytes cho AES-256');
                }
        }

        encrypt(value?: string | null): string | null {
                if (value === undefined || value === null || value === '') {
                        return null;
                }

                try {
                        const iv = randomBytes(12);

                        const cipher = createCipheriv(this.algorithm, this.key, iv);

                        const encrypted = Buffer.concat([
                                cipher.update(value, 'utf8'),
                                cipher.final(),
                        ]);

                        const authTag = cipher.getAuthTag();

                        return [
                                iv.toString('base64'),
                                authTag.toString('base64'),
                                encrypted.toString('base64'),
                        ].join('.');
                } catch {
                        throw new InternalServerErrorException(
                                'Không thể mã hóa thông tin bảo mật'
                        );
                }
        }

        decrypt(value?: string | null): string | null {
                if (value === undefined || value === null || value === '') {
                        return null;
                }

                try {
                        const parts = value.split('.');

                        if (parts.length !== 3) {
                                throw new Error('Encrypted value không hợp lệ');
                        }

                        const [ivBase64, authTagBase64, encryptedBase64] = parts;

                        const iv = Buffer.from(ivBase64, 'base64');
                        const authTag = Buffer.from(authTagBase64, 'base64');
                        const encrypted = Buffer.from(encryptedBase64, 'base64');

                        if (iv.length !== 12) {
                                throw new Error('IV không hợp lệ');
                        }

                        if (authTag.length !== 16) {
                                throw new Error('Auth tag không hợp lệ');
                        }

                        const decipher = createDecipheriv(this.algorithm, this.key, iv);

                        decipher.setAuthTag(authTag);

                        const decrypted = Buffer.concat([
                                decipher.update(encrypted),
                                decipher.final(),
                        ]);

                        return decrypted.toString('utf8');
                } catch {
                        throw new InternalServerErrorException(
                                'Không thể giải mã thông tin bảo mật'
                        );
                }
        }

        safeDecrypt(value?: string | null): string | null {
                if (value === undefined || value === null || value === '') {
                        return null;
                }

                const parts = value.split('.');

                /*
                 * Dữ liệu cũ có thể đang là plaintext.
                 *
                 * Ciphertext của Safio phải có format:
                 *
                 * IV.AUTH_TAG.ENCRYPTED_DATA
                 */
                if (parts.length !== 3) {
                        return value;
                }

                try {
                        return this.decrypt(value);
                } catch {
                        return null;
                }
        }
}
