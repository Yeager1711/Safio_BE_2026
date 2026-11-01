import type { SafioIntent } from '../intent/intent-router.service';

export class AccountContextService {
        private readonly maxChars = 7000;

        build(context: unknown, intent: SafioIntent): string {
                if (!context || typeof context !== 'object') {
                        return '';
                }

                const source = context as Record<string, unknown>;

                const allowedKeys = this.getAllowedKeys(intent);

                const filtered: Record<string, unknown> = {};

                for (const key of allowedKeys) {
                        if (source[key] === undefined) continue;

                        const safeValue = this.sanitize(source[key]);

                        if (safeValue !== undefined) {
                                filtered[key] = safeValue;
                        }
                }

                if (!Object.keys(filtered).length) {
                        return '';
                }

                const serialized = JSON.stringify(filtered, null, 2);

                return serialized.length > this.maxChars
                        ? `${serialized.slice(0, this.maxChars)}\n[Context đã được giới hạn]`
                        : serialized;
        }

        private getAllowedKeys(intent: SafioIntent): string[] {
                switch (intent) {
                        case 'camera':
                                return ['userInfo', 'cameras'];

                        case 'face-id':
                                return ['userInfo', 'faceProfile', 'verifyAuth'];

                        case 'fall-detection':
                                return ['userInfo', 'fallStats', 'fallEvents'];

                        case 'account':
                                return ['userInfo', 'familyMembers', 'verifyAuth'];

                        case 'troubleshooting':
                                return ['userInfo', 'cameras', 'faceProfile', 'fallStats'];

                        default:
                                return [];
                }
        }

        private sanitize(value: unknown): unknown {
                if (value === null || value === undefined) {
                        return value;
                }

                if (typeof value === 'string') {
                        if (this.looksLikeBase64(value)) {
                                return '[Đã loại bỏ dữ liệu ảnh Base64]';
                        }

                        return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
                }

                if (Array.isArray(value)) {
                        return value.slice(0, 30).map((item) => this.sanitize(item));
                }

                if (typeof value === 'object') {
                        const result: Record<string, unknown> = {};

                        for (const [key, nestedValue] of Object.entries(
                                value as Record<string, unknown>
                        )) {
                                if (this.isSensitiveKey(key)) continue;

                                if (this.isBase64Key(key)) {
                                        result[key] = '[Đã loại bỏ dữ liệu ảnh Base64]';
                                        continue;
                                }

                                result[key] = this.sanitize(nestedValue);
                        }

                        return result;
                }

                return value;
        }

        private isSensitiveKey(key: string): boolean {
                return /(password|secret|token|credential|embedding|api.?key)/i.test(key);
        }

        private isBase64Key(key: string): boolean {
                return /(base64|image_data|imageData|snapshot_data|snapshotData)/i.test(key);
        }

        private looksLikeBase64(value: string): boolean {
                if (value.length < 500) return false;

                return value.startsWith('data:image/') || /^[A-Za-z0-9+/=\s]+$/.test(value);
        }
}
